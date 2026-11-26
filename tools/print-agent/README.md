# TableTap print agent

A small Node process that prints kitchen tickets and receipts on an 80 mm
thermal printer. It talks to the same API as the web app, so nothing extra is
exposed by the server.

## What it does

- Polls `GET /kitchen/tickets` for open tickets and prints each one once.
- With `--receipts`, polls paid bills and prints the receipt snapshot once per
  bill (only bills paid after the agent started, unless `--backfill`).
- Renders **ESC/POS** at 42 columns and encodes Thai text to TIS-620 (code page
  18), which is what most receipt printers in Thailand expose.
- Sends bytes to the printer over TCP `9100`, or writes `.bin` files when
  `--output` is given (useful for tests and for Windows spoolers).

## Requirements

- Node 20+
- A kitchen or manager account (never the owner account on a shop floor)
- A printer reachable on the LAN with raw ESC/POS on port 9100
  (Epson TM-T82/T88, Xprinter XP-80, Sunmi, etc.)

## Run

```bash
pnpm print:agent -- \
  --api http://192.168.1.10:4100 \
  --email manager@spicegarden.local \
  --password 'TableTap!2026' \
  --printer 192.168.1.50:9100 \
  --receipts
```

Receipts need `payment.read`, so use a cashier or manager account when
`--receipts` is on. A kitchen account can print tickets only.

Printer on the same Windows machine, printing through the installed driver:
install a raw printer port or use a small TCP relay; the agent itself needs a
TCP endpoint.

Test without a printer (writes the exact bytes it would send):

```bash
node tools/print-agent/agent.mjs --once --output .print-out
```

Re-print a day's paid bills:

```bash
node tools/print-agent/agent.mjs --once --receipts --backfill --output .print-out
```

## Options

| Flag                    | Meaning                                                             |
| ----------------------- | ------------------------------------------------------------------- |
| `--api`                 | API base URL (default `API_URL` or `http://localhost:4100`)         |
| `--email`, `--password` | Staff credentials (or `PRINT_AGENT_EMAIL` / `PRINT_AGENT_PASSWORD`) |
| `--branch`              | Branch id; defaults to the account's first branch                   |
| `--stations`            | Comma-separated station codes, e.g. `HOT_KITCHEN,BEVERAGE`          |
| `--printer`             | `host:port` for raw TCP printing (port defaults to 9100)            |
| `--output`              | Write slips as `.bin` files instead of printing                     |
| `--dry`                 | Parse and render, print nothing                                     |
| `--receipts`            | Also print receipts for paid bills                                  |
| `--backfill`            | With `--receipts`, include bills paid before the agent started      |
| `--once`                | One poll, then exit                                                 |
| `--interval`            | Seconds between polls (default 8)                                   |
| `--state`               | State file (default `.print-agent-state.json`)                      |

The state file remembers which tickets and receipts were printed. Delete it to
reprint everything on the next run.

## Keep it running on Windows

Create a scheduled task that runs at logon:

```powershell
$action = New-ScheduledTaskAction -Execute "node.exe" `
  -Argument "E:\Code\tabletap\tools\print-agent\agent.mjs --email kitchen@spicegarden.local --password 'TableTap!2026' --printer 192.168.1.50:9100 --receipts" `
  -WorkingDirectory "E:\Code\tabletap"
Register-ScheduledTask -TaskName "TableTap print agent" -Action $action -RunLevel Highest
```

On Linux use a systemd unit with `Restart=always`.

## Notes

- ESC/POS printing is one-way: a successful TCP write is not proof the paper
  came out. Check the printer's own status light when setting up.
- The agent never writes to the database and never confirms payments; it only
  reads what the API already recorded.
- Thai combining marks are sent as-is and rely on the printer's Thai font. If
  your printer cannot show Thai, use the English item names or set the printer
  code page to 18 in its menu.
