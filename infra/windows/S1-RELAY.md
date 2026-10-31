# S1 SSH stdio relay

## Start from the Mac

From the repository root:

```sh
bash apps/server/scripts/s1-tunnel.sh
```

The wrapper starts the Node relay. You can also run it directly:

```sh
node apps/server/scripts/s1-relay.mjs
```

It uses Node built-ins and requires no package installation.
It binds `127.0.0.1:18080` on the Mac and carries TCP streams over one SSH exec session.
`CUEX_S1_LOCAL_PORT` selects another local port when needed.
The SSH command uses the pinned `~/.ssh/rtx-home/ssh-config`, keeps strict host-key checks enabled,
and runs the remote Python command below. It reconnects if SSH exits.
Both Mac-to-Windows health access and remote multiplex/keep-alive health checks have passed.

## Remote process

The remote script is `D:\cuex\relay\s1_relay.py`.
Start it through the allowed SSH exec channel with:

```powershell
& D:\cuex\convert-env\Scripts\python.exe -u D:\cuex\relay\s1_relay.py
```

It uses Python's standard library and opens TCP sockets only to `127.0.0.1:18080`.
It does not open a listener, parse HTTP, or configure SSH forwarding.
The Mac process owns the local listener and sends framed traffic through SSH stdin/stdout.

Each frame is ASCII and ends with a newline:

```text
<id> <open|data|close> <base64>\n
```

- IDs match `[A-Za-z0-9_-]{1,64}` and must be unique while active.
- Send `id open \n` to open a socket. The relay returns the same frame when connected.
- Send `id data BASE64\n` to write decoded bytes. Replies use the same data frame format.
- Send `id close \n` to close both directions. The relay returns one close frame.
- A connection failure or remote TCP EOF returns a close frame.
- Open and close frames have an empty payload. Keep the space before the newline.
- Data frames allow up to 1 MiB of decoded data. At most 128 channels may be active.
- Invalid framing, IDs, operations, or base64 close all channels and exit with code 2.
- stdin EOF closes every socket and exits. stdout contains frames only; errors use stderr.

A per-channel reader thread returns remote TCP bytes. A write lock keeps stdout frames intact.
HTTP keep-alive and concurrent connections pass through as ordinary TCP streams.
