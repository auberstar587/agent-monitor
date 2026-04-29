'use client';

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function useSocket() {
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    // Agent events
    socket.on('chat:agents', () => qc.invalidateQueries({ queryKey: ['agents'] }));
    socket.on('chat:status', () => qc.invalidateQueries({ queryKey: ['agents'] }));
    socket.on('chat:join', () => qc.invalidateQueries({ queryKey: ['agents'] }));
    socket.on('chat:leave', () => qc.invalidateQueries({ queryKey: ['agents'] }));

    // Task events
    socket.on('task:created', () => qc.invalidateQueries({ queryKey: ['tasks'] }));
    socket.on('task:updated', () => qc.invalidateQueries({ queryKey: ['tasks'] }));
    socket.on('task:progress', () => qc.invalidateQueries({ queryKey: ['tasks'] }));

    // Message events
    socket.on('chat:message', () => qc.invalidateQueries({ queryKey: ['messages'] }));

    // Meeting events
    socket.on('meeting:state', () => {
      qc.invalidateQueries({ queryKey: ['meeting'] });
    });

    return () => {
      socket.disconnect();
    };
  }, [qc]);

  return socketRef;
}
