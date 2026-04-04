import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RECORDINGS_DIR = path.join(process.cwd(), "recordings");
const MAX_STORAGE_MB = 100;
const MAX_STORAGE_BYTES = MAX_STORAGE_MB * 1024 * 1024;

if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR);
}

function rotateRecordings() {
  const files = fs.readdirSync(RECORDINGS_DIR)
    .map(name => ({
      name,
      path: path.join(RECORDINGS_DIR, name),
      time: fs.statSync(path.join(RECORDINGS_DIR, name)).mtime.getTime(),
      size: fs.statSync(path.join(RECORDINGS_DIR, name)).size
    }))
    .sort((a, b) => a.time - b.time);

  let totalSize = files.reduce((acc, f) => acc + f.size, 0);

  while (totalSize > MAX_STORAGE_BYTES && files.length > 0) {
    const oldest = files.shift();
    if (oldest) {
      fs.unlinkSync(oldest.path);
      totalSize -= oldest.size;
      console.log(`Deleted oldest recording: ${oldest.name} to free up space.`);
    }
  }
}

async function startServer() {
  const app = express();
  app.use(cors());
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    maxHttpBufferSize: 1e8, // 100MB
    pingTimeout: 60000,
    pingInterval: 25000,
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // Store active recordings in memory
  const activeRecordings = new Map<string, { groupId: string, userId: string, displayName: string, chunks: Buffer[] }>();

  // API to list recordings
  app.get("/api/recordings/:groupId", (req, res) => {
    const { groupId } = req.params;
    try {
      const files = fs.readdirSync(RECORDINGS_DIR)
        .filter(name => groupId === 'all' || name.includes(`_${groupId}_`))
        .map(name => {
          // Robust parsing: timestamp_groupId_userId_displayName.raw
          const parts = name.replace(".raw", "").split("_");
          const timestamp = parts[0];
          const gid = parts[1];
          const uid = parts[2];
          const displayName = parts.slice(3).join("_");
          
          return {
            filename: name,
            timestamp: parseInt(timestamp),
            groupId: gid,
            userId: uid,
            displayName: decodeURIComponent(displayName || "Usuario"),
            size: fs.statSync(path.join(RECORDINGS_DIR, name)).size
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp);
      res.json(files);
    } catch (err) {
      res.status(500).json({ error: "Failed to list recordings" });
    }
  });

  // API to play recording
  app.get("/api/recordings/play/:filename", (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(RECORDINGS_DIR, filename);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send("Recording not found");
    }
  });

  // API to delete recording
  app.delete("/api/recordings/:filename", (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(RECORDINGS_DIR, filename);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Recording not found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to delete recording" });
    }
  });

  // Socket.io logic
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-group", (groupId) => {
      socket.join(groupId);
      console.log(`User ${socket.id} joined group: ${groupId}`);
    });

    socket.on("leave-group", (groupId) => {
      socket.leave(groupId);
      console.log(`User ${socket.id} left group: ${groupId}`);
    });

    socket.on("audio-start", ({ groupId, userId, displayName }) => {
      activeRecordings.set(socket.id, {
        groupId,
        userId,
        displayName: encodeURIComponent(displayName || "Usuario"),
        chunks: []
      });
    });

    // Relay audio data to others in the same group
    socket.on("audio-data", ({ groupId, data }) => {
      // Relay
      socket.to(groupId).emit("audio-receive", {
        userId: socket.id,
        data
      });

      // Record
      const recording = activeRecordings.get(socket.id);
      if (recording) {
        recording.chunks.push(Buffer.from(data));
      }
    });

    socket.on("audio-end", () => {
      const recording = activeRecordings.get(socket.id);
      if (recording && recording.chunks.length > 0) {
        const timestamp = Date.now();
        const filename = `${timestamp}_${recording.groupId}_${recording.userId}_${recording.displayName}.raw`;
        const filePath = path.join(RECORDINGS_DIR, filename);
        
        const buffer = Buffer.concat(recording.chunks);
        fs.writeFileSync(filePath, buffer);
        console.log(`Saved recording: ${filename} (${buffer.length} bytes)`);
        
        activeRecordings.delete(socket.id);
        rotateRecordings();
        
        // Notify group of new recording
        io.to(recording.groupId).emit("new-recording", {
          filename,
          timestamp,
          userId: recording.userId,
          displayName: decodeURIComponent(recording.displayName)
        });
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      activeRecordings.delete(socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
