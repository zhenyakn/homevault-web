# Changelog

## 0.6.99
- Persist the auto-generated JWT_SECRET in /data so email, Telegram and other
  saved credentials survive restarts and add-on upgrades (no more reconfiguring
  after every reboot).

## 0.6.98
- Fix Telegram polling: drop backlog + don't serialize cyclic errors (#145)
