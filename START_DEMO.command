#!/usr/bin/env bash
set -e
cd -- "$(dirname -- "$0")"
if ! command -v node >/dev/null 2>&1; then
  printf 'Установите Node.js 24, затем откройте этот файл снова.\n'
  read -r -p 'Нажмите Enter, чтобы закрыть окно…' answer
  exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  printf 'Установите pnpm командой: npm install -g pnpm@11.25.0\n'
  read -r -p 'Нажмите Enter, чтобы закрыть окно…' answer
  exit 1
fi
node -e "if(Number(process.versions.node.split('.')[0])!==24){console.error('Нужен Node.js 24.');process.exit(1)}"
pnpm install --frozen-lockfile
exec pnpm demo
