const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '../client')));

io.on('connection', socket => {
  socket.on('join-room', roomId => {
    socket.join(roomId);
    socket.to(roomId).emit('user-joined', socket.id);

    socket.on('offer', data => socket.to(data.to).emit('offer', { from: socket.id, offer: data.offer }));
    socket.on('answer', data => socket.to(data.to).emit('answer', { from: socket.id, answer: data.answer }));
    socket.on('ice-candidate', data => socket.to(data.to).emit('ice-candidate', { from: socket.id, candidate: data.candidate }));

    socket.on('draw', data => socket.to(roomId).emit('draw', data));
    socket.on('file-share', data => socket.to(roomId).emit('file-share', data));

    socket.on('disconnect', () => socket.to(roomId).emit('user-left', socket.id));
  });
});

server.listen(3000, () => console.log('Server running on http://localhost:3000'));
