import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RECORDINGS_DIR = path.join(process.cwd(), "recordings");
const MAX_STORAGE_MB = 1000;
const MAX_STORAGE_BYTES = MAX_STORAGE_MB * 1024 * 1024;

if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR);

function rotateRecordings() {
  const files = fs.readdirSync(RECORDINGS_DIR)
    .map(name => ({name, path: path.join(RECORDINGS_DIR, name), time: fs.statSync(path.join(RECORDINGS_DIR, name)).mtime.getTime(), size: fs.statSync(path.join(RECORDINGS_DIR, name)).size}))
    .sort((a, b) => a.time - b.time);
  let totalSize = files.reduce((acc, f) => acc + f.size, 0);
  while (totalSize > MAX_STORAGE_BYTES && files.length > 0) {
    const oldest = files.shift();
    if (oldest) { fs.unlinkSync(oldest.path); totalSize -= oldest.size; }
  }
}

async function startServer() {
  const app = express();
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE'],
    credentials: true
  }));
  
  const httpServer = createServer(app);
  const io = new Server(httpServer, { 
    maxHttpBufferSize: 1e8, 
    pingTimeout: 60000, 
    pingInterval: 25000, 
    cors: { 
      origin: "*", 
      methods: ["GET", "POST"] 
    } 
  });
  
  const PORT = process.env.PORT || 3000;
  const activeRecordings = new Map();

  app.get("/api/recordings/:groupId", (req, res) => {
    const { groupId } = req.params;
    try {
      const files = fs.readdirSync(RECORDINGS_DIR).filter(name => groupId === 'all' || name.includes(`_${groupId}_`)).map(name => {
          const parts = name.replace(".raw", "").split("_");
          return { 
            filename: name, 
            timestamp: parseInt(parts[0]), 
            groupId: parts[1], 
            userId: parts[2], 
            displayName: decodeURIComponent(parts.slice(3).join("_") || "Usuario"), 
            size: fs.statSync(path.join(RECORDINGS_DIR, name)).size 
          };
        }).sort((a, b) => b.timestamp - a.timestamp);
      res.json(files);
    } catch (err) { res.status(500).json({ error: "Failed to list recordings" }); }
  });

  app.get("/api/recordings/play/:filename", (req, res) => {
    const filePath = path.join(RECORDINGS_DIR, req.params.filename);
    if (fs.existsSync(filePath)) res.sendFile(filePath); else res.status(404).send("Not found");
  });

  app.delete("/api/recordings/:filename", (req, res) => {
    const filePath = path.join(RECORDINGS_DIR, req.params.filename);
    try { if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); res.json({ success: true }); } } catch (err) { res.status(500).json({ error: "Delete failed" }); }
  });

  io.on("connection", (socket) => {
    console.log("Cliente conectado:", socket.id);
    
    socket.on("join-group", (groupId) => { 
      socket.join(groupId); 
      console.log(`Socket ${socket.id} unido a grupo: ${groupId}`);
    });
    
    socket.on("leave-group", (groupId) => { 
      socket.leave(groupId); 
    });
    
    socket.on("audio-start", ({ groupId, userId, displayName }) => { 
      activeRecordings.set(socket.id, { groupId, userId, displayName: encodeURIComponent(displayName || "Usuario"), chunks: [] }); 
    });
    
    socket.on("audio-data", ({ groupId, data }) => {
      socket.to(groupId).emit("audio-receive", { userId: socket.id, data });
      socket.to("global-monitor").emit("audio-receive", { userId: socket.id, data });
      const recording = activeRecordings.get(socket.id);
      if (recording) recording.chunks.push(Buffer.from(data));
    });
    
    socket.on("audio-end", () => {
      const recording = activeRecordings.get(socket.id);
      if (recording && recording.chunks.length > 0) {
        const timestamp = Date.now();
        const filename = `${timestamp}_${recording.groupId}_${recording.userId}_${recording.displayName}.raw`;
        const filePath = path.join(RECORDINGS_DIR, filename);
        fs.writeFileSync(filePath, Buffer.concat(recording.chunks));
        activeRecordings.delete(socket.id); 
        rotateRecordings();
        io.to(recording.groupId).emit("new-recording", { filename, timestamp, userId: recording.userId, displayName: decodeURIComponent(recording.displayName) });
      }
    });
    
    socket.on("disconnect", () => { 
      activeRecordings.delete(socket.id);
      console.log("Cliente desconectado:", socket.id);
    });
  });

  app.get("/", (req, res) => { res.send("Servidor WebSocket funcionando correctamente"); });

  httpServer.listen(PORT, "0.0.0.0", () => { console.log(`Servidor corriendo en puerto ${PORT}`); });
}

startServer();
