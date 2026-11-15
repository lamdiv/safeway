import {api} from './common.mjs';

const active = call => !['cancelled', 'declined', 'missed', 'failed', 'completed'].includes(call.status);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const description = value => ({type: value.type, sdp: value.sdp});

async function retryRequest(path, options) {
  for (let attempt = 0; ; attempt++) {
    try { return await api(path, options); }
    catch (error) {
      if (attempt >= 2 || error.status && error.status < 500) throw error;
      await sleep(150 * (attempt + 1));
    }
  }
}

function sendSignal(peer, type, data, {token, callerId} = {}) {
  return retryRequest('signals', {token, data: {
    callId: peer.callId, attempt: peer.attempt, callerId,
    messageId: crypto.randomUUID(), type, data,
  }});
}

async function addCandidate(peer, candidate) {
  if (peer.disposed || peer.pc.signalingState === 'closed') return;
  if (!peer.pc.remoteDescription) { peer.candidates.push(candidate); return; }
  // A single unusable network candidate must not kill other viable candidates.
  try { await peer.pc.addIceCandidate(candidate); }
  catch (error) { peer.candidateErrors.push(error.name); }
}

async function drainCandidates(peer) {
  while (peer.candidates.length && !peer.disposed) await addCandidate(peer, peer.candidates.shift());
}

export class CallHost {
  constructor() {
    this.callerId = crypto.randomUUID();
    this.peers = new Map(); this.claiming = new Set(); this.claimAfter = new Map();
    this.buffers = new Map(); this.cursor = 0; this.context = null; this.armed = false;
  }

  async unlock() { if (!this.context || this.context.state === 'closed') this.context = new AudioContext(); await this.context.resume(); this.armed = true; this.needsActivation = false; }

  async buffer(url) {
    if (!this.buffers.has(url)) {
      const promise = fetch(url, {signal: AbortSignal.timeout(15000)})
        .then(r => { if (!r.ok) throw new Error('Warning audio unavailable'); return r.arrayBuffer(); })
        .then(bytes => this.context.decodeAudioData(bytes))
        .catch(error => { this.buffers.delete(url); throw error; });
      this.buffers.set(url, promise);
      if (this.buffers.size > 8) this.buffers.delete(this.buffers.keys().next().value);
    }
    return this.buffers.get(url);
  }

  current(peer) { return !peer.disposed && this.peers.get(peer.callId) === peer; }

  dispose(peer) {
    if (peer.disposed) return;
    peer.disposed = true; clearInterval(peer.meter); clearTimeout(peer.disconnectTimer);
    try { peer.source?.stop(); } catch {}
    peer.destination?.stream.getTracks().forEach(track => track.stop());
    peer.pc.close();
    if (this.peers.get(peer.callId) === peer) this.peers.delete(peer.callId);
  }

  async status(peer, status, reason) {
    return retryRequest('call', {data: {
      callId: peer.callId, attempt: peer.attempt, callerId: this.callerId, status, reason,
    }});
  }

  async fail(peer, reason) {
    if (!this.current(peer) || peer.failing) return;
    peer.failing = true; this.dispose(peer);
    await this.status(peer, 'failed', reason).catch(() => {});
  }

  async update(state) {
    for (const peer of this.peers.values()) {
      const call = state.calls.find(c => c.id === peer.callId);
      if (!call || !active(call) || call.attempt > peer.attempt || call.status === 'reconnecting' && call.attempt === peer.attempt) {
        this.dispose(peer); continue;
      }
      if (Date.now() - peer.lastClaim > 1800 && !peer.renewing) {
        peer.renewing = true;
        retryRequest('call/claim', {data: {callId: peer.callId, callerId: this.callerId}})
          .then(result => {
            peer.lastClaim = Date.now();
            if (!result.claimed || result.call.attempt !== peer.attempt) this.dispose(peer);
          })
          .catch(error => { if ([409, 410].includes(error.status)) this.dispose(peer); })
          .finally(() => { peer.renewing = false; });
      }
    }
    if (!this.armed || this.context?.state !== 'running') {
      this.needsActivation = state.calls.some(active); return;
    }
    this.needsActivation = false;
    // An early Answer must still produce an offer. Previously 'answered' was excluded.
    for (const call of state.calls.filter(active)) {
      if (this.peers.has(call.id) || this.claiming.has(call.id) || Date.now() < (this.claimAfter.get(call.id) || 0)) continue;
      this.claiming.add(call.id); this.claimAfter.set(call.id, Date.now() + 1000);
      retryRequest('call/claim', {data: {callId: call.id, callerId: this.callerId}})
        .then(result => {
          if (!result.claimed) return;
          const c = result.call;
          const peer = {
            pc: new RTCPeerConnection({iceServers: []}), callId: c.id, call: c,
            attempt: c.attempt, candidates: [], candidateErrors: [], lastClaim: Date.now(),
            started: false, disposed: false,
          };
          this.peers.set(c.id, peer);
          this.offer(peer).catch(error => this.fail(peer,
            /audio/i.test(error.message) ? 'audio_unavailable' : 'signaling_failed'));
        })
        .catch(() => {})
        .finally(() => this.claiming.delete(call.id));
    }
  }

  async offer(peer) {
    await this.unlock();
    const buffer = await this.buffer(peer.call.audio);
    if (!this.current(peer)) return;
    const pc = peer.pc, destination = this.context.createMediaStreamDestination();
    peer.destination = destination;
    destination.stream.getTracks().forEach(track => pc.addTrack(track, destination.stream));
    pc.onicecandidate = e => {
      if (this.current(peer)) sendSignal(peer, 'candidate', e.candidate?.toJSON() || null,
        {callerId: this.callerId}).catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (!this.current(peer)) return;
      clearTimeout(peer.disconnectTimer);
      if (pc.connectionState === 'connected' && !peer.started) {
        peer.started = true;
        this.play(peer, buffer).catch(() => this.fail(peer, 'signaling_failed'));
      } else if (pc.connectionState === 'failed') this.fail(peer, 'ice_failed');
      else if (pc.connectionState === 'disconnected') {
        peer.disconnectTimer = setTimeout(() => this.fail(peer, 'peer_disconnected'), 7000);
      }
    };
    await pc.setLocalDescription(await pc.createOffer());
    if (!this.current(peer)) return;
    await sendSignal(peer, 'offer', description(pc.localDescription), {callerId: this.callerId});
    await this.status(peer, 'offering');
  }

  async play(peer, buffer) {
    await this.status(peer, 'connected');
    if (!this.current(peer)) return;
    const source = this.context.createBufferSource(); source.buffer = buffer;
    peer.analyser = this.context.createAnalyser();
    source.connect(peer.analyser).connect(peer.destination);
    peer.maxRms = 0; const samples = new Float32Array(peer.analyser.fftSize);
    peer.meter = setInterval(() => {
      peer.analyser.getFloatTimeDomainData(samples);
      peer.maxRms = Math.max(peer.maxRms, Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length));
    }, 50);
    peer.source = source;
    source.onended = () => {
      if (this.current(peer)) setTimeout(() => {
        if (this.current(peer)) this.status(peer, 'completed').catch(() => {});
      }, 800);
    };
    source.start();
  }

  async poll() {
    const result = await api('signals?after=' + this.cursor + '&callerId=' + encodeURIComponent(this.callerId));
    for (const event of result.signals) {
      const peer = this.peers.get(event.callId);
      if (peer && this.current(peer) && peer.attempt === event.attempt) {
        try {
          if (event.type === 'answer' && peer.pc.signalingState === 'have-local-offer') {
            await peer.pc.setRemoteDescription(event.data); await drainCandidates(peer);
          } else if (event.type === 'candidate') await addCandidate(peer, event.data);
        } catch { await this.fail(peer, 'signaling_failed'); }
      }
      this.cursor = Math.max(this.cursor, event.sequence);
    }
    this.cursor = Math.max(this.cursor, result.cursor);
  }

  close() { for (const peer of this.peers.values()) this.dispose(peer); this.buffers.clear(); this.claimAfter.clear(); }
}

export class WarningPhone {
  constructor({getToken, onState = () => {}}) {
    this.getToken = getToken; this.onState = onState; this.cursor = 0;
    this.pending = new Map(); this.peers = new Map(); this.connectionEvents = [];
    this.receivedStats = []; this.context = null; this.ringing = null;
    this.remoteAudio = new Audio(); this.remoteAudio.autoplay = true;
    this.remoteAudio.setAttribute('playsinline', '');
  }

  async unlock() { this.context ??= new AudioContext(); await this.context.resume(); }

  ring(callId) {
    if (this.ringing === callId) return;
    this.stopRing(); this.ringing = callId;
    const ring = () => {
      if (this.context?.state !== 'running') return;
      const start = this.context.currentTime;
      for (const frequency of [440, 480]) {
        const oscillator = this.context.createOscillator(), gain = this.context.createGain();
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.08, start + .025);
        gain.gain.setValueAtTime(.08, start + .8); gain.gain.linearRampToValueAtTime(0, start + .85);
        oscillator.connect(gain).connect(this.context.destination);
        oscillator.start(start); oscillator.stop(start + .9);
        (this.ringNodes ??= []).push(oscillator);
        oscillator.onended = () => { this.ringNodes = this.ringNodes.filter(n => n !== oscillator); };
      }
    };
    ring(); this.ringTimer = setInterval(ring, 2800);
  }

  stopRing() {
    clearInterval(this.ringTimer);
    for (const oscillator of this.ringNodes || []) try { oscillator.stop(); } catch {}
    this.ringNodes = []; this.ringing = null;
  }

  async answer(call) {
    await this.unlock();
    if (!this.remoteAudio.srcObject) {
      this.silentAudio = this.context.createMediaStreamDestination();
      this.remoteAudio.srcObject = this.silentAudio.stream;
      // Unlock playback without waiting for silent media to produce its first frame.
      this.remoteAudio.play().catch(() => {});
    }
    this.stopRing(); this.answerId = call.id; this.audioPlayError = null;
    await retryRequest('call', {token: this.getToken(), data: {callId: call.id, status: 'answered'}});
    await this.negotiate(call.id);
  }

  current(peer) { return !peer.disposed && this.peers.get(peer.callId) === peer; }

  async status(peer, status, reason) {
    return retryRequest('call', {token: this.getToken(), data: {
      callId: peer.callId, attempt: peer.attempt, status, reason,
    }});
  }

  dispose(peer) {
    if (peer.disposed) return;
    peer.disposed = true;
    peer.pc.getStats().then(stats => {
      for (const r of stats.values()) if (r.type === 'inbound-rtp' && r.kind === 'audio') {
        this.receivedStats.push(this.stat(peer, r));
      }
      this.receivedStats = this.receivedStats.slice(-30);
    }).catch(() => {});
    clearInterval(peer.meter); clearTimeout(peer.disconnectTimer); peer.audio?.disconnect();
    if (this.remoteAudio.srcObject === peer.mediaStream) {
      this.remoteAudio.pause(); this.remoteAudio.srcObject = null;
    }
    peer.pc.close();
    if (this.peers.get(peer.callId) === peer) this.peers.delete(peer.callId);
  }

  async fail(peer, reason) {
    if (!this.current(peer) || peer.failing) return;
    peer.failing = true; this.dispose(peer);
    await this.status(peer, 'failed', reason).catch(() => {});
    this.onState('reconnecting');
  }

  async negotiate(id) {
    const entry = this.pending.get(id);
    if (!entry?.offer || this.answerId !== id) return;
    const old = this.peers.get(id);
    if (old?.attempt === entry.attempt) return;
    if (old) this.dispose(old);
    const peer = {
      pc: new RTCPeerConnection({iceServers: []}), callId: id, attempt: entry.attempt,
      candidates: entry.candidates, candidateErrors: [], disposed: false,
    };
    this.peers.set(id, peer);
    const pc = peer.pc;
    pc.onicecandidate = e => {
      if (this.current(peer)) sendSignal(peer, 'candidate', e.candidate?.toJSON() || null,
        {token: this.getToken()}).catch(() => {});
    };
    pc.ontrack = e => {
      if (!this.current(peer)) return;
      const stream = e.streams[0] || new MediaStream([e.track]); peer.mediaStream = stream;
      this.remoteAudio.srcObject = stream;
      this.remoteAudio.play().then(() => { if (this.current(peer)) this.audioPlayError = null; }).catch(error => {
        if (!this.current(peer)) return;
        this.audioPlayError = error.message; this.onState('audio_blocked');
      });
      peer.audio = this.context.createMediaStreamSource(stream);
      peer.analyser = this.context.createAnalyser(); peer.analyser.fftSize = 256;
      peer.monitorGain = this.context.createGain(); peer.monitorGain.gain.value = 0;
      peer.audio.connect(peer.analyser).connect(peer.monitorGain).connect(this.context.destination);
      peer.maxRms = 0; const samples = new Float32Array(256);
      peer.meter = setInterval(() => {
        peer.analyser.getFloatTimeDomainData(samples);
        peer.maxRms = Math.max(peer.maxRms, Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length));
      }, 50);
      document.body.dataset.receivingAudio = 'true';
    };
    pc.onconnectionstatechange = () => {
      if (!this.current(peer)) return;
      const state = pc.connectionState;
      this.connectionEvents.push({state, attempt: peer.attempt, at: Date.now()});
      this.onState(state); document.body.dataset.peerState = state;
      clearTimeout(peer.disconnectTimer);
      if (state === 'connected') this.status(peer, 'connected').catch(() => {});
      else if (state === 'failed') this.fail(peer, 'ice_failed');
      else if (state === 'disconnected') peer.disconnectTimer = setTimeout(() => this.fail(peer, 'peer_disconnected'), 7000);
    };
    try {
      await pc.setRemoteDescription(entry.offer);
      if (!this.current(peer)) return;
      await drainCandidates(peer);
      await pc.setLocalDescription(await pc.createAnswer());
      if (this.current(peer)) await sendSignal(peer, 'answer', description(pc.localDescription), {token: this.getToken()});
    } catch { await this.fail(peer, 'signaling_failed'); }
  }

  async poll() {
    const result = await api('signals?after=' + this.cursor, {token: this.getToken()});
    for (const event of result.signals) {
      let entry = this.pending.get(event.callId);
      if (!entry || event.attempt > entry.attempt) {
        entry = {attempt: event.attempt, candidates: []}; this.pending.set(event.callId, entry);
      }
      if (event.attempt === entry.attempt) {
        if (event.type === 'offer') entry.offer = event.data;
        else if (event.type === 'candidate') {
          const peer = this.peers.get(event.callId);
          if (peer?.attempt === event.attempt) await addCandidate(peer, event.data);
          else entry.candidates.push(event.data);
        }
        await this.negotiate(event.callId);
      }
      this.cursor = Math.max(this.cursor, event.sequence);
    }
    this.cursor = Math.max(this.cursor, result.cursor);
  }

  cleanup(call) {
    for (const peer of this.peers.values()) {
      if (!call || call.id !== peer.callId || !active(call) || call.attempt > peer.attempt || call.status === 'reconnecting' && call.attempt === peer.attempt) {
        this.dispose(peer);
      }
    }
    if (!call || !active(call)) {
      if (call) this.pending.delete(call.id);
      this.answerId = null; this.audioPlayError = null;
    }
    if (!call || !['ringing', 'offering'].includes(call.status)) this.stopRing();
  }

  stat(peer, r) {
    return {callId: peer.callId, attempt: peer.attempt, bytesReceived: r.bytesReceived,
      totalAudioEnergy: r.totalAudioEnergy, packetsReceived: r.packetsReceived, maxRms: peer.maxRms || 0};
  }

  async stats() {
    const output = [...this.receivedStats];
    for (const peer of this.peers.values()) for (const r of (await peer.pc.getStats()).values()) {
      if (r.type === 'inbound-rtp' && r.kind === 'audio') output.push(this.stat(peer, r));
    }
    return output;
  }

  close() { this.stopRing(); this.cleanup(null); }
}
