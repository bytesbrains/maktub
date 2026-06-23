// src/log.js — Minimal timestamped logger. No dependencies.

'use strict';

function ts() {
  return new Date().toISOString();
}

function log(...args) {
  console.log(`[${ts()}]`, ...args);
}

function warn(...args) {
  console.warn(`[${ts()}] WARN`, ...args);
}

function err(...args) {
  console.error(`[${ts()}] ERROR`, ...args);
}

module.exports = { log, warn, err };
