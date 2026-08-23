// === ACI CONNECT — link architect to collective AI for deployment ===
const AciConnect = {
  connected: false,
  sessionId: null,

  async open() {
    if (!Auth?.user) {
      ACIControl?.reply('Sign in with G — then collective AI opens');
      Auth.openLoginModal?.('Sign in to connect');
      return null;
    }
    if (window.AciCli) AciCli.show();
    await Auth.refreshAuthority();
    return this.connect(true);
  },

  async connect(speakGreeting) {
    if (!Auth?.user) {
      ACIControl?.reply('Login required for collective connection');
      return { error: 'login required' };
    }
    GlobeDeck?.setThinking(true, 'Connecting…');

    const sync = await AciCli.api({ mode: 'owner_sync' });
    if (sync.is_owner) Auth.isOwner = true;

    const conn = await AciCli.api({
      mode: 'connect',
      deploy_context: true,
      architect: Auth.OWNER_EMAIL
    });

    this.connected = !!(conn.ok && conn.connected);
    this.sessionId = AstranovSession?.SESSION_NAME || 'ASTRANOV COLLECTIVE INTELLIGENCE';
    window._aciConnected = this.connected;
    GlobeDeck?.setThinking(false);

    const greeting = conn.greeting || (this.connected ? 'ACI connected.' : 'Connect failed: ' + (conn.error || 'unknown'));
    if (this.connected) {
      ACIControl?.reply(greeting.slice(0, 220));
      if (speakGreeting && Voice.maySpeak() && Voice.shouldSpeak(greeting)) {
        speak(greeting.slice(0, 120), () => resumeListening());
      }
    } else if (AciCli) {
      AciCli.print(greeting, 'err');
    }
    GlobeDeck?.setMapStatus(this.connected ? 'ACI linked' : 'connect failed');
    return conn;
  },

  async deploy(task) {
    if (!Auth?.isOwner) {
      const msg = 'Owner only — login as notisastranov@gmail.com';
      if (AciCli) AciCli.print(msg, 'err');
      return null;
    }
    if (!this.connected) await this.connect(false);
    if (AciCli) AciCli.print('deploy → collective AI: ' + (task || 'continue batch'), 'dim');
    const r = await AciCli.api({
      mode: 'deploy',
      task: task || 'continue deployment from streets',
      session_id: this.sessionId
    });
    const text = r.plan || r.text || r.response || r.error || '';
    if (AciCli) AciCli.print(text.slice(0, 800), r.ok ? 'out' : 'err');
    ACIControl?.reply(text.slice(0, 220));
    if (Voice.maySpeak() && Voice.shouldSpeak(text)) speak(text.slice(0, 120));
    return r;
  }
};
window.AciConnect = AciConnect;
