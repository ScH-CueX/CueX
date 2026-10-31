#!/usr/bin/env python3
"""Multiplex stdin/stdout frames to the fixed local CueX HTTP endpoint.

Frame: <id> <open|data|close> <base64>\n
open and close use an empty base64 field. stdout contains protocol frames only.
"""
from __future__ import annotations

import base64
import binascii
import re
import socket
import sys
import threading

TARGET = ("127.0.0.1", 18080)
MAX_DATA = 1024 * 1024
MAX_LINE = 4 * ((MAX_DATA + 2) // 3) + 80
MAX_CHANNELS = 128
ID_PATTERN = re.compile(rb"[A-Za-z0-9_-]{1,64}\Z")
READ_SIZE = 64 * 1024


class Relay:
    def __init__(self) -> None:
        self.channels: dict[bytes, Channel] = {}
        self.channels_lock = threading.Lock()
        self.stdout_lock = threading.Lock()
        self.output_failed = threading.Event()

    def emit(self, channel_id: bytes, operation: bytes, data: bytes = b"") -> None:
        if self.output_failed.is_set():
            return
        frame = channel_id + b" " + operation + b" " + base64.b64encode(data) + b"\n"
        with self.stdout_lock:
            try:
                sys.stdout.buffer.write(frame)
                sys.stdout.buffer.flush()
            except (BrokenPipeError, OSError):
                self.output_failed.set()

    def open(self, channel_id: bytes) -> None:
        with self.channels_lock:
            if channel_id in self.channels:
                raise ValueError("Duplicate active channel id")
            if len(self.channels) >= MAX_CHANNELS:
                self.emit(channel_id, b"close")
                return
        try:
            connection = socket.create_connection(TARGET, timeout=10)
            connection.settimeout(60)
        except OSError:
            self.emit(channel_id, b"close")
            return
        channel = Channel(self, channel_id, connection)
        with self.channels_lock:
            self.channels[channel_id] = channel
        self.emit(channel_id, b"open")
        threading.Thread(target=channel.read, daemon=True).start()

    def get(self, channel_id: bytes) -> Channel | None:
        with self.channels_lock:
            return self.channels.get(channel_id)

    def close_all(self) -> None:
        with self.channels_lock:
            channels = list(self.channels.values())
        for channel in channels:
            channel.close()

    def run(self) -> int:
        try:
            while not self.output_failed.is_set():
                line = sys.stdin.buffer.readline(MAX_LINE + 1)
                if not line:
                    break
                if len(line) > MAX_LINE or not line.endswith(b"\n"):
                    raise ValueError("Frame exceeds limit or lacks newline")
                fields = line[:-1].removesuffix(b"\r").split(b" ", 2)
                if len(fields) != 3:
                    raise ValueError("Expected id, operation and base64 fields")
                channel_id, operation, encoded = fields
                if not ID_PATTERN.fullmatch(channel_id):
                    raise ValueError("Invalid channel id")
                if operation not in (b"open", b"data", b"close"):
                    raise ValueError("Invalid operation")
                try:
                    data = base64.b64decode(encoded, validate=True)
                except (ValueError, binascii.Error) as error:
                    raise ValueError("Invalid base64 data") from error
                if len(data) > MAX_DATA:
                    raise ValueError("Decoded frame exceeds limit")
                if operation != b"data" and data:
                    raise ValueError("Open and close payloads must be empty")
                if operation == b"open":
                    self.open(channel_id)
                    continue
                channel = self.get(channel_id)
                if channel is None:
                    if operation == b"data":
                        self.emit(channel_id, b"close")
                    continue
                if operation == b"close":
                    channel.close()
                else:
                    channel.write(data)
        except (ValueError, OSError) as error:
            print(f"s1_relay: {error}", file=sys.stderr, flush=True)
            return 2
        finally:
            self.close_all()
        return 1 if self.output_failed.is_set() else 0


class Channel:
    def __init__(self, relay: Relay, channel_id: bytes, connection: socket.socket) -> None:
        self.relay = relay
        self.channel_id = channel_id
        self.connection = connection
        self.closed = False
        self.close_lock = threading.Lock()

    def close(self) -> None:
        with self.close_lock:
            if self.closed:
                return
            self.closed = True
            with self.relay.channels_lock:
                if self.relay.channels.get(self.channel_id) is self:
                    del self.relay.channels[self.channel_id]
            try:
                self.connection.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            self.connection.close()
            self.relay.emit(self.channel_id, b"close")

    def write(self, data: bytes) -> None:
        if self.closed:
            return
        try:
            self.connection.sendall(data)
        except OSError:
            self.close()

    def read(self) -> None:
        try:
            while not self.closed and not self.relay.output_failed.is_set():
                try:
                    data = self.connection.recv(READ_SIZE)
                except socket.timeout:
                    continue
                if not data:
                    break
                with self.close_lock:
                    if self.closed:
                        break
                    self.relay.emit(self.channel_id, b"data", data)
        except OSError:
            pass
        finally:
            self.close()


if __name__ == "__main__":
    raise SystemExit(Relay().run())
