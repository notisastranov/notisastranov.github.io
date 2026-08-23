/**
 * Grok Build TUI behavioral parity for Astranov CLI
 * SPECS §3.10 — this app is a fork of Grok Build: look AND work like this agent.
 * Loads after phase-app / CoreBrain. Safe to re-run.
 */
(function GrokCliParity() {
  'use strict';
  if (window.__GROK_CLI_PARITY__?.version === '20260723351000') return;
  window.__GROK_CLI_PARITY__ = { version: '20260723351000', ready: false };

  const MONO_SLASH = [
    '/help', '/clear', '/status', '/doctor', '/theme', '/compact',
    '/stop', '/hold', '/resume', '/history', '/bridge', '/fix', '/code', '/dev',
    '/model', '/session',
  ];

  function log(text, kind) {
    try {
      if (window.GlobeDeck?.log) GlobeDeck.log(text, kind || 'out');
      else if (window.AciCli?.print) AciCli.print(text, kind || 'out');
    } catch (_) {}
  }

  function toolLine(label, detail) {
    const d = detail ? '  ' + String(detail).slice(0, 120) : '';
    log('◆ ' + label + d, 'dim');
  }

  function thinking(on, msg) {
    try {
      GlobeDeck?.setThinking?.(!!on, msg || 'Grok…');
      CliRibbon?.setActive?.(on ? 'Grok' : 'ready');
      if (on) CliRibbon?.setNotice?.(msg || 'thinking…', 'thinking');
      else CliRibbon?.setNotice?.('ready', 'ready');
      const st = document.getElementById('cli-ribbon-status');
      if (st) {
        st.textContent = on ? (msg || 'thinking…') : 'ready';
        st.className = on ? 'thinking' : 'ready';
      }
    } catch (_) {}
  }

  function expandSession(title, opts) {
    try {
      // SPECS: start minimized; only open on real user action (opts.user / cmd)
      if (window.__cliUserCollapsed && !opts?.user && !opts?.force) return;
      window.__cliUserCollapsed = false;
      if (window.__cliExpand) {
        window.__cliExpand('parity');
      } else {
        GlobeDeck?.ensureCliVisible?.('cmd');
        GlobeDeck?.expand?.('force');
        const d = document.getElementById('globe-deck');
        if (d) {
          d.classList.remove('collapsed');
          d.classList.add('expanded', 'size-third');
        }
        const body = document.getElementById('globe-deck-body');
        if (body) {
          body.style.display = 'flex';
          body.style.minHeight = '120px';
          body.style.maxHeight = '44vh';
        }
      }
      GlobeDeck?.onUserMessage?.(title || 'Grok');
    } catch (_) {}
  }

  function setPromptGrok() {
    const p = document.getElementById('aci-cli-prompt');
    if (p) p.textContent = '›';
    const input = document.getElementById('aci-cli-in');
    if (input && (!input.placeholder || /Ask Astranov|Message Astranov/i.test(input.placeholder))) {
      input.placeholder = 'Message Grok…  (/help for commands)';
    }
  }

  /* ── Slash commands (Grok Build style) ───────────────────────── */
  async function runSlash(raw) {
    const line = String(raw || '').trim();
    if (!line.startsWith('/')) return false;
    const parts = line.slice(1).trim().split(/\s+/);
    const cmd = (parts[0] || '').toLowerCase();
    const rest = parts.slice(1).join(' ');

    expandSession('Grok', { user: true });
    log('› ' + line, 'cmd');

    if (cmd === 'help' || cmd === 'h' || cmd === '?') {
      log('Grok Build fork — slash commands', 'ok');
      log('/help  /clear  /status  /doctor  /theme [dark|bright|auto]', 'dim');
      log('/compact  /stop  /hold  /resume  /history  /session', 'dim');
      log('/fix <task>  /code <change>  /dev <task>  /bridge [poll|status]', 'dim');
      log('Or type naturally — locate, fly to Rhodes, order food, fix the CLI…', 'dim');
      thinking(false);
      return true;
    }
    if (cmd === 'clear' || cmd === 'cls') {
      AciCli?.clear?.();
      GlobeDeck?.clearLog?.();
      log('scrollback cleared', 'ok');
      thinking(false);
      return true;
    }
    if (cmd === 'status' || cmd === 'session') {
      const u = Auth?.user?.email || 'guest';
      const arch = Auth?.isArchitect ? 'architect' : (Auth?.user ? 'signed-in' : 'guest');
      const build = document.querySelector('meta[name="astranov-build"]')?.content || '?';
      log('session · ' + arch + ' · ' + u, 'ok');
      log('build ' + build + ' · brain ' + (AstranovCoreBrain?.version || '—') + ' · parity ' + window.__GROK_CLI_PARITY__.version, 'dim');
      log('tools: locate · city · multi-tile · DNA delivery · bridge · OS', 'dim');
      thinking(false);
      return true;
    }
    if (cmd === 'doctor') {
      const checks = [
        ['GlobeDeck', !!window.GlobeDeck?.log],
        ['AciCli', !!window.AciCli?.run],
        ['CoreBrain', !!window.AstranovCoreBrain?.handle],
        ['SuperCli', !!window.SuperCli?.exec],
        ['MultiTile', !!window.MultiTile],
        ['DeliveryDNA', !!window.DeliveryDNA],
        ['ArchitectBridge', !!window.ArchitectBridge],
        ['Auth', !!window.Auth],
      ];
      checks.forEach(([n, ok]) => log((ok ? '✓ ' : '✗ ') + n, ok ? 'ok' : 'err'));
      thinking(false);
      return true;
    }
    if (cmd === 'theme' || cmd === 't') {
      const mode = (rest || 'dark').toLowerCase();
      if (mode === 'help' || !rest) {
        log('usage: /theme dark|bright|auto', 'dim');
      } else {
        AstranovTheme?.set?.(mode === 'light' ? 'bright' : mode);
        log('theme → ' + (AstranovTheme?._auto ? 'auto' : AstranovTheme?.mode || mode), 'ok');
      }
      thinking(false);
      return true;
    }
    if (cmd === 'compact') {
      const d = document.getElementById('globe-deck');
      if (d) {
        d.classList.toggle('grok-compact');
        log(d.classList.contains('grok-compact') ? 'compact on' : 'compact off', 'ok');
      }
      thinking(false);
      return true;
    }
    if (cmd === 'stop') {
      try { userIntervene?.(); } catch (_) {}
      thinking(false);
      log('stopped', 'ok');
      return true;
    }
    if (cmd === 'hold' || cmd === 'pause') {
      SessionHold?.hold?.();
      log('session held', 'ok');
      thinking(false);
      return true;
    }
    if (cmd === 'resume' || cmd === 'unhold') {
      await SessionHold?.resume?.();
      log('session resumed', 'ok');
      thinking(false);
      return true;
    }
    if (cmd === 'history') {
      const h = AciCli?.history || [];
      if (!h.length) log('(empty history)', 'dim');
      else h.slice(-12).forEach((line, i) => log((h.length - 12 + i + 1 > 0 ? h.length - Math.min(12, h.length) + i + 1 : i + 1) + '  ' + line, 'dim'));
      thinking(false);
      return true;
    }
    if (cmd === 'model') {
      log('model · Grok Build fork (Astranov CoreBrain + bridge)', 'ok');
      log('freeform → CoreBrain · build → ArchitectBridge (owner)', 'dim');
      thinking(false);
      return true;
    }
    if (cmd === 'bridge' || cmd === 'fix' || cmd === 'code' || cmd === 'dev') {
      const task = cmd === 'bridge' ? (rest || 'bridge status') : (cmd + (rest ? ' ' + rest : ''));
      if (cmd !== 'bridge' && !rest) {
        log('usage: /' + cmd + ' <task>', 'err');
        thinking(false);
        return true;
      }
      thinking(true, 'bridge…');
      toolLine('ArchitectBridge', task);
      try {
        if (window.ArchitectBridge?.handleCommand) {
          await ArchitectBridge.handleCommand(task.startsWith(cmd) ? task : (cmd + ' ' + rest));
        } else if (window.AciCli?.handle) {
          await AciCli.handle(cmd + (rest ? ' ' + rest : ''));
        } else {
          log('bridge not loaded', 'err');
        }
      } catch (e) {
        log('bridge error: ' + (e.message || e), 'err');
      }
      thinking(false);
      return true;
    }

    log('unknown slash /' + cmd + ' — try /help', 'err');
    thinking(false);
    return true;
  }

  /* ── Grok-style agent turn wrapper around CoreBrain ──────────── */
  function patchCoreBrain() {
    const B = window.AstranovCoreBrain;
    if (!B || B.__grokPatched) return;
    B.__grokPatched = true;

    const _execute = B.execute?.bind(B);
    if (_execute) {
      B.execute = async function (plan) {
        const actions = plan?.actions || [];
        if (actions.length) {
          for (const a of actions) {
            toolLine(a.type || 'tool', a.label || a.tier || a.query || '');
          }
        } else {
          toolLine('reason', plan?.intent || 'chat');
        }
        return _execute(plan);
      };
    }

    const _deliver = B.deliver?.bind(B);
    if (_deliver) {
      B.deliver = function (text, opts) {
        expandSession('Grok');
        return _deliver(text, opts);
      };
    }

    const _askAi = B.askAi?.bind(B);
    if (_askAi) {
      B.askAi = async function (message, plan) {
        toolLine('aicycle', 'fast model');
        // Force Grok-fork identity into system by wrapping result path;
        // inject via temporary patch of system string inside original if possible.
        const orig = _askAi;
        // Call with monkey-patched system by wrapping fetch once is heavy —
        // instead prepend identity note on message context via history.
        try {
          if (!this._grokSysOnce) {
            this._grokSysOnce = true;
            this.history = this.history || [];
            this.history.unshift({
              role: 'system',
              content: 'You are Grok, forked into Astranov SpaceNet. Act. Be direct. Same language as user. Short.',
            });
          }
        } catch (_) {}
        return orig(message, plan);
      };
    }

    const _handle = B.handle?.bind(B);
    if (_handle) {
      B.handle = async function (message, opts) {
        expandSession('Grok');
        thinking(true, 'Grok…');
        log('◎ thinking…', 'dim');
        try {
          const r = await _handle(message, opts);
          thinking(false);
          return r;
        } catch (e) {
          thinking(false);
          log(String(e.message || e), 'err');
          throw e;
        }
      };
    }
  }

  /* ── AciCli: keys, slash, history, always-on turn ────────────── */
  function patchAciCli() {
    const C = window.AciCli;
    if (!C || C.__grokPatched) return;
    C.__grokPatched = true;

    // Keep Grok › prompt forever
    const _onAuth = C.onAuthChange?.bind(C);
    C.onAuthChange = function () {
      try { _onAuth?.(); } catch (_) {}
      setPromptGrok();
      try {
        CliRibbon?.setActive?.('Grok');
        document.getElementById('globe-deck-title') &&
          (document.getElementById('globe-deck-title').textContent = 'Astranov · Grok');
      } catch (_) {}
    };

    // History navigation + Grok keys
    const _onKey = C.onKey?.bind(C);
    C.onKey = function (e) {
      const input = e.target;
      if (e.key === 'ArrowUp' && !e.shiftKey) {
        if (!this.history?.length) return true;
        e.preventDefault();
        if (this.histIdx < 0) this.histIdx = this.history.length;
        this.histIdx = Math.max(0, this.histIdx - 1);
        input.value = this.history[this.histIdx] || '';
        this.buffer = input.value;
        window.resizeCliInput?.(input);
        return true;
      }
      if (e.key === 'ArrowDown' && !e.shiftKey) {
        if (!this.history?.length) return true;
        e.preventDefault();
        if (this.histIdx < 0) return true;
        this.histIdx = Math.min(this.history.length, this.histIdx + 1);
        if (this.histIdx >= this.history.length) {
          this.histIdx = -1;
          input.value = '';
        } else {
          input.value = this.history[this.histIdx] || '';
        }
        this.buffer = input.value;
        window.resizeCliInput?.(input);
        return true;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        this.clear?.();
        GlobeDeck?.clearLog?.();
        return true;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.clear?.();
        GlobeDeck?.clearLog?.();
        return true;
      }
      // Enter send / Shift+Enter newline — existing
      return _onKey ? _onKey(e) : false;
    };

    const _run = C.run?.bind(C);
    C.run = async function (line, opts) {
      line = String((window.fixVoiceHotwords || (x => x))(String(line || ''))).trim();
      if (!line) {
        // Empty send: just focus, stay minimized unless already open
        await AciCoders?.enterSession?.({ focus: true, ping: false, expand: false });
        return;
      }
      setPromptGrok();
      expandSession('Grok — ' + line.slice(0, 36), { user: true });

      // Slash first (Grok Build)
      if (line.startsWith('/')) {
        this.history = this.history || [];
        this.history.push(line);
        this.histIdx = -1;
        await runSlash(line);
        return;
      }

      // Bare help aliases
      if (/^(help|\?)$/i.test(line)) {
        await runSlash('/help');
        return;
      }

      this.history = this.history || [];
      this.history.push(line);
      this.histIdx = -1;

      // Don't double-print cmd if SuperCli will — we print once here Grok-style
      log('› ' + line, 'cmd');
      thinking(true, 'Grok…');

      try {
        // Prefer SuperCli structured, then CoreBrain agent turn
        const routed = await SuperCli?.exec?.(line, { ...(opts || {}), _grokParity: true });
        if (routed?.handled) {
          thinking(false);
          return;
        }
        if (window.AstranovCoreBrain?.handle) {
          await AstranovCoreBrain.handle(line, opts);
          thinking(false);
          return;
        }
        if (_run) {
          // Original run would re-print cmd — temporarily no-op print for first cmd line
          await this.handle?.(line);
        }
      } catch (e) {
        log(String(e.message || e), 'err');
      } finally {
        thinking(false);
        setPromptGrok();
      }
    };

    // Avoid double-logging › when handle prints again with old prompt
    const _print = C.print?.bind(C);
    C.print = function (t, cls) {
      // Never force-expand on print — minimized by default
      return _print ? _print(t, cls) : log(t, cls);
    };

    // Guest may use CLI (Grok works without gate for chat)
    const _show = C.show?.bind(C);
    C.show = function () {
      expandSession('Grok', { user: true });
      this.open = true;
      setPromptGrok();
      document.getElementById('aci-cli-in')?.focus();
      if (Auth?.user) return _show?.();
    };

    const _submit = C.submitFromInput?.bind(C);
    C.submitFromInput = function (opts) {
      const input = document.getElementById('aci-cli-in');
      const line = String(input?.value || '').replace(/\n+$/, '').trim();
      if (!line) {
        if (opts?.emptyFocus) document.getElementById('aci-cli-in')?.focus();
        return false;
      }
      expandSession('Grok', { user: true });
      thinking(true, 'Grok…');
      if (input) {
        input.value = '';
        this.buffer = '';
        window.resizeCliInput?.(input);
      }
      void this.run(line, opts);
      return true;
    };
  }

  /* ── SuperCli: freeform always agent; slash pass-through ─────── */
  function patchSuperCli() {
    const S = window.SuperCli;
    if (!S?.exec || S.__grokPatched) return;
    S.__grokPatched = true;
    const _exec = S.exec.bind(S);
    S.exec = async function (raw, opts) {
      const line = String(raw || '').trim();
      if (line.startsWith('/')) {
        await runSlash(line);
        return { handled: true, slash: true };
      }
      // Avoid double cmd print from SuperCli.out when parity already logged
      const r = await _exec(raw, opts);
      return r;
    };
  }

  /* ── GlobeDeck: do NOT force-expand on every log (start minimized) ── */
  function patchGlobeDeck() {
    const G = window.GlobeDeck;
    if (!G?.log || G.__grokPatched) return;
    G.__grokPatched = true;
    const _log = G.log.bind(G);
    G.log = function (text, cls) {
      // Leave expand policy to 91-cli-gestures (__cliUserCollapsed)
      return _log(text, cls);
    };
  }

  function bootBanner() {
    // Quiet banner into log only — never expand on boot
    try {
      const out = document.getElementById('globe-deck-log');
      if (!out || out.dataset.grokBanner) return;
      out.dataset.grokBanner = '1';
      if (out.children.length === 0) {
        // Use dim so minimized lock doesn't treat as user cmd
        const a = document.createElement('div');
        a.className = 'deck-line deck-dim';
        a.textContent = 'Grok ready · type below or tap handle to expand';
        out.appendChild(a);
      }
    } catch (_) {}
  }

  function apply() {
    setPromptGrok();
    patchGlobeDeck();
    patchCoreBrain();
    patchAciCli();
    patchSuperCli();
    try { AciCli?.onAuthChange?.(); } catch (_) {}
    bootBanner();
    window.__GROK_CLI_PARITY__.ready = true;
    try {
      CliRibbon?.setActive?.('Grok');
      CliRibbon?.setNotice?.('Grok ready', 'ready');
    } catch (_) {}
  }

  // Apply once + one late pass (avoid re-patch thrash on Firefox)
  apply();
  setTimeout(apply, 800);
})();
