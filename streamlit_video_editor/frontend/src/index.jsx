import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Streamlit } from "streamlit-component-lib";

/* ═══════════════════════════════════════════════════════════
   SUPERPOWERED VIDEO EDITOR — NLE with media import & preview
   ═══════════════════════════════════════════════════════════ */

const C = {
  bg: "#08080f", panel: "#0e0e1c", surface: "#141428",
  track0: "#0c0c1e", track1: "#0f0f24",
  border: "rgba(255,255,255,0.06)", borderLight: "rgba(255,255,255,0.12)",
  text: "#e2e8f0", textMuted: "#94a3b8", dim: "#475569",
  accent: "#818cf8", accentDim: "#6366f1", accentGlow: "rgba(129,140,248,0.18)",
  red: "#f87171", redGlow: "rgba(248,113,113,0.35)",
  green: "#34d399", greenDim: "#059669", amber: "#fbbf24", cyan: "#22d3ee",
  dropZone: "rgba(129,140,248,0.08)",
};

const PPS = 14;
const TRACK_H = 64;
const HEADER_W = 148;
const RULER_H = 30;
const SNAP_VAL = 0.25;

let _uid = 100;
const uid = () => `c${_uid++}`;
const snapTo = (v, on) => on ? Math.round(v / SNAP_VAL) * SNAP_VAL : v;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function fmtTC(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const fr = Math.floor((s % 1) * 30);
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}:${String(fr).padStart(2,"0")}`;
}
function fmtShort(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const f = Math.floor((s % 1) * 10);
  return `${m}:${String(sec).padStart(2,"0")}.${f}`;
}
function fmtSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes/1024).toFixed(1) + " KB";
  return (bytes/1048576).toFixed(1) + " MB";
}

const PALETTE = {
  video: ["#818cf8","#a78bfa","#c084fc","#f0abfc","#7c3aed","#6366f1"],
  audio: ["#34d399","#2dd4bf","#22d3ee","#38bdf8","#10b981","#06b6d4"],
};
function pickColor(type, idx) { const p = PALETTE[type] || PALETTE.video; return p[idx % p.length]; }

/* ── seeded pseudo-random ── */
function seededRand(seed) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s & 0xffff) / 0xffff; };
}

/* ── CSS waveform bars ── */
function Waveform({ width, height, color, seed }) {
  const bars = useMemo(() => {
    const rng = seededRand(seed);
    const count = Math.max(Math.floor(width / 3), 4);
    return Array.from({ length: count }, () => rng());
  }, [width, seed]);
  return (
    <div style={{ display:"flex", alignItems:"center", height, gap:1, padding:"0 2px", overflow:"hidden" }}>
      {bars.map((h, i) => (
        <div key={i} style={{ flex:"0 0 2px", borderRadius:1, height:`${20+h*70}%`, background:color, opacity:0.35+h*0.3 }} />
      ))}
    </div>
  );
}

/* ── filmstrip thumbnails ── */
function Filmstrip({ width, height, color, seed }) {
  const thumbs = useMemo(() => {
    const rng = seededRand(seed);
    const tw = height * 0.85;
    const count = Math.max(Math.floor(width / (tw + 3)), 1);
    return Array.from({ length: count }, () => rng());
  }, [width, height, seed]);
  const tw = height * 0.85;
  return (
    <div style={{ display:"flex", gap:3, alignItems:"center", height, padding:"0 3px", overflow:"hidden" }}>
      {thumbs.map((v, i) => {
        const hue = 220 + v * 40;
        return (
          <div key={i} style={{
            flex:`0 0 ${tw}px`, height:tw, borderRadius:4,
            background:`linear-gradient(135deg, hsl(${hue},30%,22%), hsl(${hue},25%,16%))`,
            border:`1px solid ${color}25`,
          }} />
        );
      })}
    </div>
  );
}

/* ── thumbnail generator (with timeout fallback) ── */
function generateThumbnail(file) {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (val) => { if (!resolved) { resolved = true; resolve(val); } };
    // Timeout after 5s so import never hangs
    setTimeout(() => done({ duration: 0, thumbnail: null }), 5000);

    if (file.type.startsWith("audio/") || file.name.match(/\.(mp3|wav|ogg|aac|flac|m4a|wma)$/i)) {
      const audio = new Audio();
      const url = URL.createObjectURL(file);
      audio.src = url;
      audio.onloadedmetadata = () => { done({ duration: audio.duration, thumbnail: null }); URL.revokeObjectURL(url); };
      audio.onerror = () => { done({ duration: 0, thumbnail: null }); URL.revokeObjectURL(url); };
      return;
    }
    const vid = document.createElement("video");
    vid.preload = "auto"; vid.muted = true; vid.playsInline = true;
    const url = URL.createObjectURL(file);
    vid.src = url;
    vid.onloadedmetadata = () => {
      // If duration is available, try to seek for thumbnail
      if (vid.duration && vid.duration > 0) {
        vid.currentTime = Math.min(1, vid.duration * 0.1);
      } else {
        done({ duration: 0, thumbnail: null });
        URL.revokeObjectURL(url);
      }
    };
    vid.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 160; canvas.height = 90;
        canvas.getContext("2d").drawImage(vid, 0, 0, 160, 90);
        done({ duration: vid.duration, thumbnail: canvas.toDataURL("image/jpeg", 0.6) });
      } catch(e) {
        done({ duration: vid.duration || 0, thumbnail: null });
      }
      URL.revokeObjectURL(url);
    };
    vid.onerror = () => { done({ duration: 0, thumbnail: null }); URL.revokeObjectURL(url); };
  });
}

/* ── detect media type from file ── */
function detectMediaType(file) {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  const ext = (file.name || "").split(".").pop().toLowerCase();
  const videoExts = ["mp4","mov","avi","mkv","webm","m4v","wmv","flv","ts","mts","3gp"];
  const audioExts = ["mp3","wav","ogg","aac","flac","m4a","wma","opus","aiff"];
  if (videoExts.includes(ext)) return "video";
  if (audioExts.includes(ext)) return "audio";
  return null;
}

/* ── default demo tracks ── */
function defaultTracks() {
  return [
    { id:"v1", name:"Video 1", type:"video", locked:false, solo:false, muted:false, clips:[
      { id:uid(), label:"Intro.mp4", start:0, duration:6, mediaId:null },
      { id:uid(), label:"Interview_A.mp4", start:7, duration:12, mediaId:null },
      { id:uid(), label:"Outro.mp4", start:22, duration:5, mediaId:null },
    ]},
    { id:"v2", name:"B-Roll", type:"video", locked:false, solo:false, muted:false, clips:[
      { id:uid(), label:"City_Aerial.mp4", start:3, duration:9, mediaId:null },
      { id:uid(), label:"Office_B.mp4", start:15, duration:8, mediaId:null },
    ]},
    { id:"a1", name:"Dialogue", type:"audio", locked:false, solo:false, muted:false, clips:[
      { id:uid(), label:"Interview_Audio.wav", start:7, duration:12, mediaId:null },
    ]},
    { id:"a2", name:"Music", type:"audio", locked:false, solo:false, muted:false, clips:[
      { id:uid(), label:"Ambient_Score.mp3", start:0, duration:27, mediaId:null },
    ]},
    { id:"a3", name:"SFX", type:"audio", locked:false, solo:false, muted:false, clips:[
      { id:uid(), label:"Whoosh.wav", start:6.5, duration:1, mediaId:null },
      { id:uid(), label:"Transition.wav", start:19, duration:0.8, mediaId:null },
    ]},
  ];
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */
export default function VideoEditor() {
  const [tracks, setTracks] = useState(defaultTracks());
  const [ph, setPh] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState(null);
  const [scrollX, setScrollX] = useState(0);
  const [height, setHeight] = useState(700);
  const [dragging, setDragging] = useState(false);
  const [inited, setInited] = useState(false);

  const [mediaFiles, setMediaFiles] = useState([]);
  const [tool, setTool] = useState("select");
  const [snapOn, setSnapOn] = useState(true);
  const [showBin, setShowBin] = useState(true);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [clipboard, setClipboard] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLabel, setPreviewLabel] = useState("");
  const [previewClipStart, setPreviewClipStart] = useState(0);
  const [previewClipDur, setPreviewClipDur] = useState(0);
  const [markIn, setMarkIn] = useState(null);
  const [markOut, setMarkOut] = useState(null);
  const [looping, setLooping] = useState(false);
  const [dropTarget, setDropTarget] = useState(-1);
  const [binDrop, setBinDrop] = useState(false);
  const [panelH, setPanelH] = useState(240);
  const [binW, setBinW] = useState(280);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [binCollapsed, setBinCollapsed] = useState(false);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);

  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const scrollRef = useRef(null);
  const playRef = useRef(null);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const dragMediaRef = useRef(null);
  const rootRef = useRef(null);
  const audioPoolRef = useRef({});  // clipId → { audio: Audio, mediaId, url }
  const mediaFilesRef = useRef(mediaFiles);
  mediaFilesRef.current = mediaFiles;
  const playingRef = useRef(playing);
  playingRef.current = playing;

  const pps = PPS * zoom;

  /* ── undo helpers ── */
  const pushHistory = useCallback(() => {
    setHistory(h => [...h.slice(-50), JSON.parse(JSON.stringify(tracksRef.current))]);
    setFuture([]);
  }, []);
  const undo = useCallback(() => {
    setHistory(h => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setFuture(f => [...f, JSON.parse(JSON.stringify(tracksRef.current))]);
      setTracks(prev);
      return h.slice(0, -1);
    });
  }, []);
  const redo = useCallback(() => {
    setFuture(f => {
      if (f.length === 0) return f;
      const next = f[f.length - 1];
      setHistory(h => [...h, JSON.parse(JSON.stringify(tracksRef.current))]);
      setTracks(next);
      return f.slice(0, -1);
    });
  }, []);

  /* ── init from Streamlit ── */
  useEffect(() => {
    const onRender = (event) => {
      const { args } = event.detail;
      if (args.height) setHeight(args.height);
      if (!inited && args.tracks && args.tracks.length > 0) {
        const t = args.tracks.map((tr) => ({
          ...tr, locked:false, solo:false, muted:tr.muted||false,
          clips: (tr.clips||[]).map((c) => ({
            ...c, id:c.id||uid(), mediaId:c.mediaId||null,
            duration: c.duration != null ? c.duration : (c.end ? c.end - c.start : 5),
          })),
        }));
        setTracks(t);
        setInited(true);
      }
      Streamlit.setFrameHeight(args.height || 700);
    };
    Streamlit.events.addEventListener(Streamlit.RENDER_EVENT, onRender);
    Streamlit.setComponentReady();
    return () => Streamlit.events.removeEventListener(Streamlit.RENDER_EVENT, onRender);
  }, [inited]);

  const sendState = useCallback((t, playhead) => {
    Streamlit.setComponentValue({ tracks: t.map(tr => ({
      id:tr.id, name:tr.name, type:tr.type, muted:tr.muted,
      clips: tr.clips.map(c => ({ id:c.id, label:c.label, start:+c.start.toFixed(2), duration:+c.duration.toFixed(2), mediaId:c.mediaId||null })),
    })), playhead: +(playhead||0).toFixed(2) });
  }, []);

  /* ── file import (robust: fallback to extension-based detection) ── */
  const importFiles = useCallback(async (files) => {
    const items = [];
    for (const file of files) {
      const type = detectMediaType(file);
      if (!type) continue;
      const url = URL.createObjectURL(file);
      let duration = 5, thumbnail = null;
      try {
        const info = await generateThumbnail(file);
        if (info.duration > 0) duration = info.duration;
        if (info.thumbnail) thumbnail = info.thumbnail;
      } catch(e) { /* ignore - use defaults */ }
      items.push({ id:uid(), name:file.name, type, url, duration:Math.round(duration*100)/100, thumbnail, size:file.size });
    }
    if (items.length > 0) setMediaFiles(prev => [...prev, ...items]);
  }, []);

  const handleFileInput = useCallback((e) => {
    if (e.target.files && e.target.files.length > 0) importFiles(Array.from(e.target.files));
    e.target.value = "";
  }, [importFiles]);

  /* ── clip under playhead (needed before preview logic) ── */
  const clipAtPh = useMemo(() => {
    for (const tr of tracks) {
      if (tr.type !== "video" || tr.muted) continue;
      for (const c of tr.clips) { if (ph >= c.start && ph < c.start + c.duration) return c; }
    }
    return null;
  }, [tracks, ph]);

  /* ── preview logic: show selected clip OR clip at playhead ── */
  useEffect(() => {
    // Priority 1: selected clip with media
    if (sel) {
      for (const tr of tracks) {
        const clip = tr.clips.find(c => c.id === sel);
        if (clip && clip.mediaId) {
          const m = mediaFiles.find(f => f.id === clip.mediaId);
          if (m) {
            setPreviewUrl(m.url); setPreviewLabel(clip.label);
            setPreviewClipStart(clip.start); setPreviewClipDur(clip.duration);
            return;
          }
        }
      }
    }
    // Priority 2: topmost video clip at playhead with media
    if (clipAtPh && clipAtPh.mediaId) {
      const m = mediaFiles.find(f => f.id === clipAtPh.mediaId);
      if (m) {
        setPreviewUrl(m.url); setPreviewLabel(clipAtPh.label);
        setPreviewClipStart(clipAtPh.start); setPreviewClipDur(clipAtPh.duration);
        return;
      }
    }
    setPreviewUrl(null); setPreviewLabel("");
    setPreviewClipStart(0); setPreviewClipDur(0);
  }, [sel, tracks, mediaFiles, clipAtPh]);

  /* ── sync video element with timeline playhead ── */
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !previewUrl) return;
    const offset = clamp(ph - previewClipStart, 0, previewClipDur || Infinity);
    if (playing) {
      if (Math.abs(vid.currentTime - offset) > 0.3) vid.currentTime = offset;
      if (vid.paused) vid.play().catch(() => {});
    } else {
      if (!vid.paused) vid.pause();
      vid.currentTime = offset;
    }
  }, [ph, playing, previewUrl, previewClipStart, previewClipDur]);

  /* ── audio playback engine: play imported media for clips at playhead ── */
  useEffect(() => {
    const hasSoloTrack = tracksRef.current.some(t => t.solo);
    // Gather all clips that overlap the playhead and have linked media
    const activeClips = new Set();
    if (playing) {
      for (const tr of tracksRef.current) {
        const audible = tr.muted ? false : (hasSoloTrack ? tr.solo : true);
        if (!audible) continue;
        for (const clip of tr.clips) {
          if (!clip.mediaId) continue;
          if (ph >= clip.start && ph < clip.start + clip.duration) {
            activeClips.add(clip.id);
            const pool = audioPoolRef.current;
            const offset = ph - clip.start;
            const mf = mediaFilesRef.current.find(f => f.id === clip.mediaId);
            if (!mf) continue;
            // Create or reuse audio element
            if (!pool[clip.id] || pool[clip.id].mediaId !== clip.mediaId) {
              if (pool[clip.id]) { pool[clip.id].audio.pause(); pool[clip.id].audio.src = ""; }
              const audio = new Audio(mf.url);
              audio.preload = "auto";
              pool[clip.id] = { audio, mediaId: clip.mediaId };
            }
            const { audio } = pool[clip.id];
            // Sync time (correct drift > 200ms)
            if (Math.abs(audio.currentTime - offset) > 0.2) audio.currentTime = offset;
            if (audio.paused) audio.play().catch(() => {});
          }
        }
      }
    }
    // Pause any audio elements for clips NOT currently active
    const pool = audioPoolRef.current;
    for (const cid of Object.keys(pool)) {
      if (!activeClips.has(cid)) {
        pool[cid].audio.pause();
      }
    }
  }, [ph, playing]);

  /* ── cleanup all audio on unmount ── */
  useEffect(() => {
    return () => {
      const pool = audioPoolRef.current;
      for (const cid of Object.keys(pool)) {
        pool[cid].audio.pause();
        pool[cid].audio.src = "";
        delete pool[cid];
      }
    };
  }, []);

  /* ── stop all audio when playback stops ── */
  useEffect(() => {
    if (!playing) {
      const pool = audioPoolRef.current;
      for (const cid of Object.keys(pool)) {
        pool[cid].audio.pause();
      }
    }
  }, [playing]);

  /* ── computed ── */
  const totalDur = useMemo(() => {
    let m = 30;
    tracks.forEach(tr => tr.clips.forEach(c => { const e = c.start + c.duration; if (e > m) m = e; }));
    return m + 8;
  }, [tracks]);
  const clipCount = useMemo(() => tracks.reduce((s, t) => s + t.clips.length, 0), [tracks]);

  /* ── playback ── */
  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    const startPh = ph;
    const tick = () => {
      const elapsed = (performance.now() - start) / 1000;
      let next = startPh + elapsed;
      if (looping && markIn != null && markOut != null && next >= markOut) next = markIn;
      if (next >= totalDur) { setPlaying(false); setPh(0); return; }
      setPh(next);
      playRef.current = requestAnimationFrame(tick);
    };
    playRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(playRef.current);
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── drag & trim ── */
  const startDrag = useCallback((e, clipId, mode) => {
    e.preventDefault(); e.stopPropagation();
    if (tool === "razor") return;
    setDragging(true); setSel(clipId);
    const x0 = e.clientX;
    let tIdx = -1, cIdx = -1;
    tracksRef.current.forEach((tr, ti) => { const ci = tr.clips.findIndex(c => c.id === clipId); if (ci >= 0) { tIdx = ti; cIdx = ci; } });
    if (tIdx < 0) return;
    pushHistory();
    const orig = { ...tracksRef.current[tIdx].clips[cIdx] };
    const onMove = (ev) => {
      const dx = ev.clientX - x0;
      const dt = dx / pps;
      setTracks(prev => prev.map((tr, ti) => ti !== tIdx ? tr : {
        ...tr, clips: tr.clips.map((c, ci) => {
          if (ci !== cIdx) return c;
          if (mode === "move") return { ...c, start: snapTo(Math.max(0, orig.start + dt), snapOn) };
          if (mode === "trim-left") { const ns = snapTo(clamp(orig.start + dt, 0, orig.start + orig.duration - 0.5), snapOn); return { ...c, start: ns, duration: orig.duration - (ns - orig.start) }; }
          return { ...c, duration: snapTo(Math.max(0.5, orig.duration + dt), snapOn) };
        }),
      }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setDragging(false);
      setTracks(cur => { sendState(cur, ph); return cur; });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [pps, ph, sendState, snapOn, pushHistory, tool]);

  /* ── razor split ── */
  const razorSplit = useCallback((trackIdx, clipIdx, splitTime) => {
    pushHistory();
    setTracks(prev => prev.map((tr, ti) => {
      if (ti !== trackIdx) return tr;
      const clip = tr.clips[clipIdx];
      if (!clip) return tr;
      const rel = splitTime - clip.start;
      if (rel <= 0.1 || rel >= clip.duration - 0.1) return tr;
      const left = { ...clip, duration: rel };
      const right = { ...clip, id: uid(), start: splitTime, duration: clip.duration - rel };
      const nc = [...tr.clips]; nc.splice(clipIdx, 1, left, right);
      return { ...tr, clips: nc };
    }));
  }, [pushHistory]);

  /* ── scrub ── */
  const scrubRuler = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollX;
    setPh(clamp(x / pps, 0, totalDur));
  }, [pps, scrollX, totalDur]);

  /* ── track actions ── */
  const toggleMute = (i) => setTracks(p => p.map((t, j) => j === i ? { ...t, muted: !t.muted } : t));
  const toggleLock = (i) => setTracks(p => p.map((t, j) => j === i ? { ...t, locked: !t.locked } : t));
  const toggleSolo = (i) => setTracks(p => p.map((t, j) => j === i ? { ...t, solo: !t.solo } : t));

  const addTrack = (type) => { pushHistory(); setTracks(prev => {
    const n = prev.filter(t => t.type === type).length + 1;
    return [...prev, { id:`${type[0]}${Date.now()}`, name:`${type === "video" ? "Video" : "Audio"} ${n+1}`, type, locked:false, solo:false, muted:false, clips:[] }];
  }); };

  const addClipAtPlayhead = useCallback((mediaItem, trackIdx) => {
    pushHistory();
    setTracks(prev => prev.map((tr, i) => {
      if (i !== trackIdx) return tr;
      return { ...tr, clips: [...tr.clips, {
        id:uid(), label:mediaItem.name, start:snapTo(ph, snapOn),
        duration:Math.min(mediaItem.duration, 120), mediaId:mediaItem.id,
      }] };
    }));
  }, [pushHistory, snapOn, ph]);

  /* ── drag media to empty area → create new track ── */
  const addTrackWithMedia = useCallback((mediaItem) => {
    pushHistory();
    const type = mediaItem.type;
    setTracks(prev => {
      const n = prev.filter(t => t.type === type).length + 1;
      const newTrack = {
        id:`${type[0]}${Date.now()}`,
        name:`${type === "video" ? "Video" : "Audio"} ${n+1}`,
        type, locked:false, solo:false, muted:false,
        clips: [{
          id:uid(), label:mediaItem.name, start:snapTo(ph, snapOn),
          duration:Math.min(mediaItem.duration, 120), mediaId:mediaItem.id,
        }],
      };
      return [...prev, newTrack];
    });
  }, [pushHistory, snapOn, ph]);

  const addClip = (ti) => { pushHistory(); setTracks(prev => {
    const next = prev.map((tr, i) => {
      if (i !== ti) return tr;
      let maxEnd = 0;
      tr.clips.forEach(c => { const e = c.start + c.duration; if (e > maxEnd) maxEnd = e; });
      return { ...tr, clips: [...tr.clips, { id:uid(), label:tr.type === "video" ? "New_Clip.mp4" : "New_Audio.wav", start:snapTo(maxEnd+0.5, snapOn), duration:4, mediaId:null }] };
    });
    sendState(next, ph); return next;
  }); };

  const delClip = useCallback(() => {
    if (!sel) return; pushHistory();
    setTracks(prev => { const next = prev.map(tr => ({ ...tr, clips: tr.clips.filter(c => c.id !== sel) })); sendState(next, ph); return next; });
    setSel(null);
  }, [sel, ph, sendState, pushHistory]);

  const delTrack = (ti) => { pushHistory(); setTracks(prev => { const next = prev.filter((_, i) => i !== ti); sendState(next, ph); return next; }); };

  const copyClip = useCallback(() => {
    if (!sel) return;
    for (const tr of tracksRef.current) { const clip = tr.clips.find(c => c.id === sel); if (clip) { setClipboard({ ...clip, trackType: tr.type }); return; } }
  }, [sel]);

  const pasteClip = useCallback(() => {
    if (!clipboard) return; pushHistory();
    const ti = tracksRef.current.findIndex(tr => tr.type === clipboard.trackType);
    if (ti < 0) return;
    setTracks(prev => prev.map((tr, i) => {
      if (i !== ti) return tr;
      return { ...tr, clips: [...tr.clips, { ...clipboard, id: uid(), start: snapTo(ph, snapOn) }] };
    }));
  }, [clipboard, ph, pushHistory, snapOn]);

  const removeMediaFile = useCallback((id) => { setMediaFiles(prev => prev.filter(m => m.id !== id)); }, []);

  /* ── keyboard handler (attached to root div, works inside iframe) ── */
  const handleKeyDown = useCallback((e) => {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key === "Delete" || e.key === "Backspace") { delClip(); return; }
    if (e.key === " ") { e.preventDefault(); setPlaying(p => !p); return; }
    if (e.key === "c" && !e.metaKey && !e.ctrlKey) { setTool("razor"); return; }
    if (e.key === "v" && !e.metaKey && !e.ctrlKey) { setTool("select"); return; }
    if (e.key === "s" && !e.metaKey && !e.ctrlKey) { setSnapOn(p => !p); return; }
    if (e.key === "i") { setMarkIn(ph); return; }
    if (e.key === "o") { setMarkOut(ph); return; }
    if (e.key === "l" && !e.metaKey && !e.ctrlKey) { setLooping(p => !p); return; }
    if (e.key === "j") { setPh(p => Math.max(0, p - 1)); return; }
    if (e.key === "k") { setPlaying(p => !p); return; }
    if (e.key === "ArrowLeft") { e.preventDefault(); setPh(p => Math.max(0, p - (e.shiftKey ? 5 : 1))); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); setPh(p => Math.min(totalDur - 1, p + (e.shiftKey ? 5 : 1))); return; }
    if (e.key === "Home") { setPh(0); return; }
    if (e.key === "End") { setPh(totalDur - 8); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) { e.preventDefault(); redo(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === "c") { copyClip(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === "v") { pasteClip(); return; }
  }, [delClip, undo, redo, copyClip, pasteClip, ph, totalDur]);

  /* ── auto-focus root so keys work immediately ── */
  useEffect(() => { if (rootRef.current) rootRef.current.focus(); }, []);

  const timelineW = totalDur * pps;
  const hasSolo = tracks.some(t => t.solo);
  const rulerMarks = useMemo(() => {
    const step = zoom >= 2 ? 1 : zoom >= 0.8 ? 2 : zoom >= 0.4 ? 5 : 10;
    const marks = [];
    for (let t = 0; t <= totalDur; t += step) marks.push({ t, major: t % (step * 2) === 0 || step <= 1 });
    return marks;
  }, [totalDur, zoom]);

  const previewH = previewCollapsed && binCollapsed ? 0 : panelH;
  const effectiveBinW = binCollapsed ? 0 : binW;

  /* ════════════════════════ RENDER ════════════════════════ */
  return (
    <div ref={rootRef} tabIndex={0} onKeyDown={handleKeyDown}
      onClick={() => rootRef.current && rootRef.current.focus()}
      style={{
      fontFamily:"'Inter','DM Sans',system-ui,sans-serif", background:C.bg,
      borderRadius:14, border:`1px solid ${C.border}`, overflow:"hidden",
      height, display:"flex", flexDirection:"column", color:C.text,
      userSelect: dragging ? "none" : "auto", outline:"none",
    }}>
      {/* hidden file input — broad accept to avoid browser filtering issues */}
      <input ref={fileRef} type="file" accept="video/*,audio/*,.mp4,.mov,.avi,.mkv,.webm,.mp3,.wav,.ogg,.aac,.flac,.m4a" multiple
        style={{ display:"none" }} onChange={handleFileInput} />

      {/* ═══ TOOLBAR ═══ */}
      <div style={{
        display:"flex", alignItems:"center", gap:5, padding:"6px 12px",
        background:`linear-gradient(180deg, ${C.panel}, ${C.bg})`,
        borderBottom:`1px solid ${C.border}`, flexShrink:0,
      }}>
        <TBtn icon={"\u23EE"} tip="Go to start" onClick={() => setPh(0)} />
        <TBtn icon={"\u23EA"} tip="Back 5s" onClick={() => setPh(Math.max(0, ph - 5))} />
        <TBtn icon={playing ? "\u23F8" : "\u25B6"} accent tip={playing?"Pause":"Play"} onClick={() => setPlaying(!playing)} />
        <TBtn icon={"\u23E9"} tip="Forward 5s" onClick={() => setPh(Math.min(totalDur-1, ph + 5))} />
        <TBtn icon={"\u23ED"} tip="Go to end" onClick={() => setPh(totalDur - 8)} />
        <Sep />
        <div style={{
          fontFamily:"'JetBrains Mono','SF Mono',monospace", fontSize:12,
          color:playing ? C.green : C.textMuted, letterSpacing:"0.04em",
          background:"rgba(255,255,255,0.03)", padding:"3px 8px", borderRadius:6,
          border:`1px solid ${C.border}`, minWidth:170, textAlign:"center",
        }}>
          {fmtTC(ph)} <span style={{color:C.dim, fontSize:10}}>/ {fmtShort(totalDur-8)}</span>
        </div>
        <Sep />
        <TBtn icon={"\u25C7"} label="Select" active={tool==="select"} tip="Select tool (V)" onClick={() => setTool("select")} />
        <TBtn icon={"\u2702"} label="Razor" active={tool==="razor"} tip="Razor tool (C)" onClick={() => setTool("razor")} />
        <Sep />
        <TBtn icon={"\u25A6"} label="Snap" active={snapOn} tip="Toggle snap (S)" onClick={() => setSnapOn(p=>!p)} />
        <TBtn icon={"\u21BB"} label="Loop" active={looping} tip="Toggle loop (L)" onClick={() => setLooping(p=>!p)} />
        <Sep />
        <TBtn icon={"\u25B7"} label="In" tip="Mark In (I)" onClick={() => setMarkIn(ph)} />
        <TBtn icon={"\u25C1"} label="Out" tip="Mark Out (O)" onClick={() => setMarkOut(ph)} />
        {markIn != null && markOut != null && (
          <span style={{ fontSize:9, color:C.cyan, fontFamily:"monospace" }}>{fmtShort(markIn)}-{fmtShort(markOut)}</span>
        )}
        <Sep />
        <TBtn icon={"\u21B6"} tip="Undo (\u2318Z)" onClick={undo} disabled={history.length===0} />
        <TBtn icon={"\u21B7"} tip="Redo (\u2318\u21E7Z)" onClick={redo} disabled={future.length===0} />
        <div style={{ flex:1 }} />
        <TBtn icon={"\uD83D\uDCC1"} label="Import" accent tip="Import media files" onClick={() => fileRef.current && fileRef.current.click()} />
        <TBtn icon={"\uD83C\uDFAC"} label="V+" tip="Add video track" onClick={() => addTrack("video")} />
        <TBtn icon={"\uD83C\uDFB5"} label="A+" tip="Add audio track" onClick={() => addTrack("audio")} />
        {sel && <><Sep /><TBtn icon={"\u2715"} label="Delete" danger onClick={delClip} /></>}
        <Sep />
        <TBtn icon={showBin ? "\u25BC" : "\u25B2"} tip="Toggle media panel" onClick={() => { setPreviewCollapsed(p => !p); setBinCollapsed(p => !p); }} />
        <div style={{ display:"flex", alignItems:"center", gap:4, marginLeft:4 }}>
          <span style={{ fontSize:8, color:C.dim, letterSpacing:"0.08em" }}>ZOOM</span>
          <input type="range" min={0.2} max={5} step={0.05} value={zoom}
            onChange={(e) => setZoom(+e.target.value)}
            style={{ width:70, accentColor:C.accent, height:3 }} />
          <span style={{ fontSize:10, color:C.textMuted, fontFamily:"monospace", minWidth:32, textAlign:"right" }}>{zoom.toFixed(1)}x</span>
        </div>
      </div>

      {/* ═══ PREVIEW + MEDIA BIN ═══ */}
      {(previewH > 0) && (
        <div style={{
          display:"flex", height:previewH, borderBottom:`1px solid ${C.border}`,
          background:C.panel, flexShrink:0,
        }}>
          {/* Video Preview */}
          {!previewCollapsed && (
          <div style={{ flex:1, display:"flex", flexDirection:"column", borderRight:`1px solid ${C.border}`, minWidth:0 }}>
            <SectionHeader label="Preview" extra={previewLabel} collapsed={false} onToggle={() => setPreviewCollapsed(true)} />
            <div style={{
              flex:1, display:"flex", alignItems:"center", justifyContent:"center",
              background:"#000", position:"relative", overflow:"hidden",
            }}>
              {previewUrl ? (
                <video ref={videoRef} src={previewUrl}
                  style={{ maxWidth:"100%", maxHeight:"100%", objectFit:"contain" }}
                  playsInline />
              ) : (
                <div style={{ textAlign:"center" }}>
                  {clipAtPh ? (
                    <>
                      <div style={{ fontSize:36, marginBottom:8, opacity:0.3 }}>{"\uD83C\uDFAC"}</div>
                      <div style={{ fontSize:12, color:C.textMuted }}>{clipAtPh.label}</div>
                      <div style={{ fontSize:10, color:C.dim, marginTop:4 }}>
                        {clipAtPh.mediaId ? "Playing..." : "No media linked"}
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize:36, marginBottom:8, opacity:0.15 }}>{"\u25B6"}</div>
                      <div style={{ fontSize:11, color:C.dim }}>Select a clip to preview</div>
                      <div style={{ fontSize:10, color:C.dim, marginTop:4, opacity:0.6 }}>Import media & add to timeline</div>
                    </>
                  )}
                </div>
              )}
              {/* timecode overlay */}
              <div style={{
                position:"absolute", bottom:8, left:8,
                fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#fff",
                background:"rgba(0,0,0,0.6)", padding:"2px 8px", borderRadius:4,
                pointerEvents:"none",
              }}>{fmtTC(ph)}</div>
              {clipAtPh && (
                <div style={{
                  position:"absolute", top:8, left:8,
                  fontSize:9, color:C.accent, background:"rgba(0,0,0,0.6)",
                  padding:"2px 8px", borderRadius:4, pointerEvents:"none",
                }}>{"\u25CF"} {clipAtPh.label}</div>
              )}
            </div>
          </div>
          )}
          {previewCollapsed && (
            <CollapsedTab label="Preview" onToggle={() => setPreviewCollapsed(false)} />
          )}

          {/* Resize handle between preview and bin */}
          {!previewCollapsed && !binCollapsed && (
            <ResizeHandle
              direction="horizontal"
              onResize={(delta) => setBinW(prev => clamp(prev - delta, 160, 500))}
            />
          )}

          {/* Media Bin */}
          {!binCollapsed ? (
          <div style={{ width:effectiveBinW, flexShrink:0, display:"flex", flexDirection:"column", background:C.surface }}
            onDragOver={(e) => { e.preventDefault(); setBinDrop(true); }}
            onDragLeave={() => setBinDrop(false)}
            onDrop={(e) => { e.preventDefault(); setBinDrop(false); if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) importFiles(Array.from(e.dataTransfer.files)); }}
          >
            <div style={{
              padding:"4px 10px", fontSize:9, color:C.dim, letterSpacing:"0.12em",
              textTransform:"uppercase", borderBottom:`1px solid ${C.border}`,
              display:"flex", alignItems:"center", justifyContent:"space-between",
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <button onClick={() => setBinCollapsed(true)} style={{
                  background:"none", border:"none", color:C.dim, cursor:"pointer", fontSize:8, padding:0, fontFamily:"inherit",
                }} title="Collapse">{"\u25B6"}</button>
                <span>Media Bin ({mediaFiles.length})</span>
              </div>
              <button onClick={() => fileRef.current && fileRef.current.click()} style={{
                background:"none", border:"none", color:C.accent, cursor:"pointer",
                fontSize:9, fontFamily:"inherit", padding:"0 4px",
              }}>+ Import</button>
            </div>
            <div style={{
              flex:1, overflowY:"auto", padding:4,
              background: binDrop ? C.dropZone : "transparent", transition:"background 0.15s",
            }}>
              {mediaFiles.length === 0 ? (
                <div style={{
                  display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                  height:"100%", gap:8, opacity:0.5,
                  border:`2px dashed ${C.borderLight}`, borderRadius:10, margin:4,
                }}>
                  <span style={{ fontSize:28 }}>{"\uD83D\uDCC1"}</span>
                  <span style={{ fontSize:11, color:C.textMuted }}>Drop files here</span>
                  <span style={{ fontSize:9, color:C.dim }}>or click Import</span>
                </div>
              ) : (
                mediaFiles.map((mf) => (
                  <div key={mf.id}
                    draggable
                    onDragStart={(e) => {
                      dragMediaRef.current = mf;
                      e.dataTransfer.effectAllowed = "copy";
                      e.dataTransfer.setData("text/plain", mf.id);
                    }}
                    onClick={() => {
                      if (mf.type === "video") setPreviewUrl(mf.url);
                      setPreviewLabel(mf.name);
                    }}
                    style={{
                      display:"flex", gap:8, alignItems:"center", padding:"6px 8px",
                      borderRadius:8, marginBottom:3, cursor:"grab",
                      background:"rgba(255,255,255,0.02)", border:`1px solid ${C.border}`,
                    }}
                  >
                    {mf.thumbnail ? (
                      <img src={mf.thumbnail} alt="" style={{ width:48, height:27, borderRadius:4, objectFit:"cover", flexShrink:0 }} />
                    ) : (
                      <div style={{
                        width:48, height:27, borderRadius:4, flexShrink:0,
                        background:mf.type==="video" ? "rgba(129,140,248,0.1)" : "rgba(52,211,153,0.1)",
                        display:"flex", alignItems:"center", justifyContent:"center", fontSize:14,
                      }}>{mf.type==="video" ? "\uD83C\uDFAC" : "\u266A"}</div>
                    )}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:10, fontWeight:500, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{mf.name}</div>
                      <div style={{ fontSize:8, color:C.dim, marginTop:1 }}>
                        {mf.type.toUpperCase()} {"\u00B7"} {fmtShort(mf.duration)} {"\u00B7"} {fmtSize(mf.size)}
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); removeMediaFile(mf.id); }}
                      style={{ background:"none", border:"none", color:C.dim, cursor:"pointer", fontSize:12, padding:2 }}
                      title="Remove">{"\u2715"}</button>
                  </div>
                ))
              )}
            </div>
          </div>
          ) : (
            <CollapsedTab label={`Bin (${mediaFiles.length})`} onToggle={() => setBinCollapsed(false)} />
          )}
        </div>
      )}

      {/* Vertical resize handle between preview panel and timeline */}
      {previewH > 0 && !timelineCollapsed && (
        <ResizeHandle
          direction="vertical"
          onResize={(delta) => setPanelH(prev => clamp(prev + delta, 100, height - 180))}
        />
      )}

      {/* ═══ RULER ═══ */}
      {!timelineCollapsed ? (<>
      <div style={{ display:"flex", height:RULER_H, background:C.panel, borderBottom:`1px solid ${C.borderLight}`, flexShrink:0 }}>
        <div style={{ width:HEADER_W, flexShrink:0, borderRight:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
          <button onClick={() => setTimelineCollapsed(true)} style={{
            background:"none", border:"none", color:C.dim, cursor:"pointer", fontSize:8, padding:0, fontFamily:"inherit",
          }} title="Collapse timeline">{"\u25BC"}</button>
          <span style={{ fontSize:8, color:C.dim, letterSpacing:"0.15em", textTransform:"uppercase" }}>Tracks</span>
        </div>
        <div style={{ flex:1, overflow:"hidden", position:"relative", cursor:"pointer" }} onClick={scrubRuler}>
          <div style={{ position:"relative", width:timelineW, marginLeft:-scrollX }}>
            {markIn != null && markOut != null && (
              <div style={{ position:"absolute", left:markIn*pps, width:(markOut-markIn)*pps, top:0, bottom:0, background:"rgba(34,211,238,0.08)", borderLeft:`1px solid ${C.cyan}60`, borderRight:`1px solid ${C.cyan}60` }} />
            )}
            {rulerMarks.map(({ t, major }) => (
              <div key={t} style={{ position:"absolute", left:t*pps, bottom:0, height:"100%" }}>
                <div style={{ width:1, height:major?14:8, background:major?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.07)", position:"absolute", bottom:0 }} />
                {major && <span style={{ position:"absolute", top:4, left:5, fontSize:8, color:C.dim, fontFamily:"monospace", whiteSpace:"nowrap" }}>{fmtShort(t)}</span>}
              </div>
            ))}
            <div style={{ position:"absolute", left:ph*pps-5, bottom:0, width:0, height:0, borderLeft:"5px solid transparent", borderRight:"5px solid transparent", borderBottom:`8px solid ${C.red}` }} />
          </div>
        </div>
      </div>

      {/* ═══ TRACKS AREA ═══ */}
      <div style={{ flex:1, overflow:"auto", position:"relative" }}
        ref={scrollRef} onScroll={(e) => setScrollX(e.currentTarget.scrollLeft)}>
        <div style={{ display:"flex", minWidth:HEADER_W + timelineW }}>

          {/* track headers (sticky) */}
          <div style={{ width:HEADER_W, flexShrink:0, background:C.panel, borderRight:`1px solid ${C.border}`, position:"sticky", left:0, zIndex:12 }}>
            {tracks.map((tr, i) => {
              const muted = tr.muted || (hasSolo && !tr.solo);
              return (
                <div key={tr.id} style={{
                  height:TRACK_H, display:"flex", alignItems:"center", padding:"0 8px",
                  borderBottom:`1px solid ${C.border}`, gap:6,
                  background:i%2===0 ? C.panel : "rgba(255,255,255,0.01)",
                  opacity:muted ? 0.45 : 1, transition:"opacity 0.15s",
                }}>
                  <div style={{ width:4, height:28, borderRadius:2, flexShrink:0, background:tr.type==="video"?C.accent:C.green }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tr.name}</div>
                    <div style={{ fontSize:8, color:C.dim, marginTop:1, letterSpacing:"0.06em" }}>{tr.type.toUpperCase()} {"\u00B7"} {tr.clips.length}</div>
                  </div>
                  <div style={{ display:"flex", gap:2, flexShrink:0 }}>
                    <MBtn tip="Mute" on={tr.muted} c={C.red} onClick={() => toggleMute(i)}>M</MBtn>
                    <MBtn tip="Solo" on={tr.solo} c={C.amber} onClick={() => toggleSolo(i)}>S</MBtn>
                    <MBtn tip="Lock" on={tr.locked} c={C.textMuted} onClick={() => toggleLock(i)}>{"\uD83D\uDD12"}</MBtn>
                    <MBtn tip="Add clip" onClick={() => addClip(i)}>+</MBtn>
                    <MBtn tip="Delete track" c={C.red} onClick={() => delTrack(i)}>{"\u00D7"}</MBtn>
                  </div>
                </div>
              );
            })}
            {/* ── Add Track buttons row ── */}
            <div style={{
              height:TRACK_H, display:"flex", alignItems:"center", justifyContent:"center", gap:8,
              padding:"0 8px", borderBottom:`1px solid ${C.border}`,
              background:"rgba(255,255,255,0.01)",
            }}>
              <button onClick={() => addTrack("video")} style={{
                display:"flex", alignItems:"center", gap:4, padding:"6px 12px",
                background:"rgba(129,140,248,0.08)", border:`1px solid ${C.accent}30`,
                borderRadius:6, color:C.accent, cursor:"pointer", fontSize:10, fontWeight:600,
                fontFamily:"inherit", transition:"all 0.15s",
              }}>{"\uD83C\uDFAC"} + Video</button>
              <button onClick={() => addTrack("audio")} style={{
                display:"flex", alignItems:"center", gap:4, padding:"6px 12px",
                background:"rgba(52,211,153,0.08)", border:`1px solid ${C.green}30`,
                borderRadius:6, color:C.green, cursor:"pointer", fontSize:10, fontWeight:600,
                fontFamily:"inherit", transition:"all 0.15s",
              }}>{"\u266A"} + Audio</button>
            </div>
          </div>

          {/* timeline */}
          <div style={{ flex:1, position:"relative" }}>
            {tracks.map((tr, i) => {
              const muted = tr.muted || (hasSolo && !tr.solo);
              return (
                <div key={tr.id} style={{
                  height:TRACK_H, position:"relative",
                  background: dropTarget === i ? C.dropZone : (i%2===0 ? C.track0 : C.track1),
                  borderBottom:`1px solid ${C.border}`,
                  opacity:muted ? 0.35 : 1, transition:"opacity 0.15s, background 0.15s",
                  cursor: tool === "razor" ? "crosshair" : "default",
                }}
                  onClick={(e) => {
                    if (tool !== "razor") {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setPh(clamp((e.clientX - rect.left) / pps, 0, totalDur));
                    }
                  }}
                  onDragOver={(e) => { e.preventDefault(); setDropTarget(i); }}
                  onDragLeave={() => setDropTarget(-1)}
                  onDrop={(e) => {
                    e.preventDefault(); setDropTarget(-1);
                    const mf = dragMediaRef.current;
                    if (mf) { addClipAtPlayhead(mf, i); dragMediaRef.current = null; }
                  }}
                >
                  {rulerMarks.filter(m => m.major).map(({ t }) => (
                    <div key={t} style={{ position:"absolute", left:t*pps, top:0, bottom:0, width:1, background:"rgba(255,255,255,0.02)" }} />
                  ))}
                  {markIn != null && markOut != null && (
                    <div style={{ position:"absolute", left:markIn*pps, width:(markOut-markIn)*pps, top:0, bottom:0, background:"rgba(34,211,238,0.04)" }} />
                  )}

                  {tr.clips.map((clip, ci) => {
                    const w = Math.max(clip.duration * pps, 18);
                    const x = clip.start * pps;
                    const clr = pickColor(tr.type, ci);
                    const isSel = sel === clip.id;
                    const hasMedia = clip.mediaId && mediaFiles.find(m => m.id === clip.mediaId);

                    return (
                      <div key={clip.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (tool === "razor") {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const clickTime = clip.start + (e.clientX - rect.left) / pps;
                            razorSplit(i, ci, snapTo(clickTime, snapOn));
                          } else {
                            setSel(isSel ? null : clip.id);
                          }
                        }}
                        onMouseDown={(e) => { if (e.button === 0 && !tr.locked && tool === "select") startDrag(e, clip.id, "move"); }}
                        style={{
                          position:"absolute", left:x, top:5, bottom:5, width:w,
                          borderRadius:7, overflow:"hidden",
                          cursor: tool === "razor" ? "crosshair" : (tr.locked ? "default" : "grab"),
                          background:`linear-gradient(180deg, ${clr}22, ${clr}08)`,
                          border:`1.5px solid ${isSel ? C.accent : clr + "30"}`,
                          boxShadow: isSel ? `0 0 16px ${clr}25, inset 0 1px 0 ${clr}15` : `inset 0 1px 0 ${clr}08`,
                          transition:"box-shadow 0.12s, border-color 0.12s",
                        }}
                      >
                        <div style={{ height:3, background:`linear-gradient(90deg, ${clr}80, ${clr}20)` }} />
                        {hasMedia && <div style={{ position:"absolute", top:5, right:5, width:6, height:6, borderRadius:3, background:C.green }} title="Media linked" />}
                        <div style={{ flex:1, overflow:"hidden", height:TRACK_H-30 }}>
                          {tr.type === "audio"
                            ? <Waveform width={w} height={TRACK_H-30} color={clr} seed={clip.id.charCodeAt(1)*137+ci} />
                            : <Filmstrip width={w} height={TRACK_H-30} color={clr} seed={clip.id.charCodeAt(1)*137+ci} />}
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:4, padding:"0 6px", height:16, background:`${clr}12`, borderTop:`1px solid ${clr}12` }}>
                          <span style={{ fontSize:8, fontWeight:500, color:`${clr}cc`, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {tr.type==="video" ? "\uD83C\uDFAC" : "\u266A"} {clip.label}
                          </span>
                          <span style={{ marginLeft:"auto", fontSize:7, color:C.dim, fontFamily:"monospace", flexShrink:0 }}>{clip.duration.toFixed(1)}s</span>
                        </div>
                        {!tr.locked && tool === "select" && <>
                          <div onMouseDown={(e) => { e.stopPropagation(); startDrag(e, clip.id, "trim-left"); }}
                            style={{ position:"absolute", left:0, top:0, bottom:0, width:7, cursor:"ew-resize", borderRadius:"7px 0 0 7px" }}>
                            {isSel && <div style={{ position:"absolute", left:2, top:"50%", transform:"translateY(-50%)", width:2, height:14, borderRadius:1, background:C.accent }} />}
                          </div>
                          <div onMouseDown={(e) => { e.stopPropagation(); startDrag(e, clip.id, "trim-right"); }}
                            style={{ position:"absolute", right:0, top:0, bottom:0, width:7, cursor:"ew-resize", borderRadius:"0 7px 7px 0" }}>
                            {isSel && <div style={{ position:"absolute", right:2, top:"50%", transform:"translateY(-50%)", width:2, height:14, borderRadius:1, background:C.accent }} />}
                          </div>
                        </>}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* playhead */}
            <div style={{
              position:"absolute", top:0, bottom:0, left:ph*pps,
              width:2, background:C.red, boxShadow:`0 0 10px ${C.redGlow}`,
              pointerEvents:"none", zIndex:20,
            }}>
              <div style={{ position:"absolute", top:-3, left:-5, width:12, height:12, background:C.red, borderRadius:2, transform:"rotate(45deg)" }} />
            </div>

            {/* in/out markers */}
            {markIn != null && (
              <div style={{ position:"absolute", top:0, bottom:0, left:markIn*pps, width:2, background:`${C.cyan}80`, pointerEvents:"none", zIndex:19 }}>
                <div style={{ position:"absolute", top:0, left:-1, fontSize:7, color:C.cyan, fontFamily:"monospace", background:"rgba(0,0,0,0.5)", padding:"0 3px", borderRadius:2 }}>IN</div>
              </div>
            )}
            {markOut != null && (
              <div style={{ position:"absolute", top:0, bottom:0, left:markOut*pps, width:2, background:`${C.cyan}80`, pointerEvents:"none", zIndex:19 }}>
                <div style={{ position:"absolute", top:0, left:-1, fontSize:7, color:C.cyan, fontFamily:"monospace", background:"rgba(0,0,0,0.5)", padding:"0 3px", borderRadius:2 }}>OUT</div>
              </div>
            )}

            {/* ── Drop zone for creating new track ── */}
            <NewTrackDropZone
              height={TRACK_H}
              onDropMedia={(mf) => addTrackWithMedia(mf)}
              dragMediaRef={dragMediaRef}
            />
          </div>
        </div>
      </div>
      </>) : (
        <div style={{
          padding:"6px 12px", background:C.panel, borderBottom:`1px solid ${C.border}`,
          display:"flex", alignItems:"center", gap:8, cursor:"pointer", flexShrink:0,
        }} onClick={() => setTimelineCollapsed(false)}>
          <span style={{ fontSize:10, color:C.dim }}>{"\u25B6"}</span>
          <span style={{ fontSize:10, color:C.textMuted, letterSpacing:"0.08em" }}>TIMELINE ({tracks.length} tracks, {clipCount} clips)</span>
        </div>
      )}

      {/* ═══ STATUS BAR ═══ */}
      <div style={{
        display:"flex", alignItems:"center", gap:8, padding:"4px 12px",
        background:C.panel, borderTop:`1px solid ${C.border}`,
        fontSize:9, color:C.dim, fontFamily:"'JetBrains Mono','SF Mono',monospace", flexShrink:0,
      }}>
        <Pill>{tracks.length} tracks</Pill>
        <Pill>{clipCount} clips</Pill>
        <Pill>{fmtShort(totalDur-8)} dur</Pill>
        {mediaFiles.length > 0 && <Pill>{mediaFiles.length} media</Pill>}
        {clipboard && <Pill c={C.accent}>Clipboard</Pill>}
        {history.length > 0 && <Pill>{history.length} undo</Pill>}
        <div style={{ flex:1 }} />
        <span style={{ fontSize:8, opacity:0.5 }}>
          Space=play {"\u00B7"} V=select {"\u00B7"} C=razor {"\u00B7"} S=snap {"\u00B7"} I/O=marks {"\u00B7"} L=loop {"\u00B7"} {"\u2318"}Z=undo {"\u00B7"} Del=remove {"\u00B7"} Drag from bin to timeline
        </span>
      </div>
    </div>
  );
}

/* ═══ UI ATOMS ═══ */

function SectionHeader({ label, extra, collapsed, onToggle }) {
  return (
    <div style={{
      padding:"4px 10px", fontSize:9, color:C.dim, letterSpacing:"0.12em",
      textTransform:"uppercase", borderBottom:`1px solid ${C.border}`,
      display:"flex", alignItems:"center", gap:6,
    }}>
      <button onClick={onToggle} style={{
        background:"none", border:"none", color:C.dim, cursor:"pointer", fontSize:8, padding:0, fontFamily:"inherit",
      }} title={collapsed ? "Expand" : "Collapse"}>{collapsed ? "\u25B6" : "\u25BC"}</button>
      <span>{label}</span>
      {extra && <span style={{ color:C.textMuted, textTransform:"none", letterSpacing:0 }}>{"\u2014"} {extra}</span>}
    </div>
  );
}

function CollapsedTab({ label, onToggle }) {
  return (
    <div onClick={onToggle} style={{
      width:28, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
      background:C.surface, cursor:"pointer", borderRight:`1px solid ${C.border}`,
      writingMode:"vertical-rl", textOrientation:"mixed",
    }}>
      <span style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.08em", textTransform:"uppercase" }}>
        {"\u25C0"} {label}
      </span>
    </div>
  );
}

function ResizeHandle({ direction, onResize }) {
  const isV = direction === "vertical";
  const [active, setActive] = useState(false);
  return (
    <div
      style={{
        [isV ? "height" : "width"]: active ? 5 : 4,
        [isV ? "width" : "height"]: "100%",
        cursor: isV ? "ns-resize" : "ew-resize",
        background: active ? C.accent + "40" : "transparent",
        flexShrink: 0,
        position: "relative",
        zIndex: 25,
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={(e) => { if (e.buttons === 0) setActive(false); }}
      onMouseDown={(e) => {
        e.preventDefault();
        setActive(true);
        let last = isV ? e.clientY : e.clientX;
        const onMove = (ev) => {
          const cur = isV ? ev.clientY : ev.clientX;
          const delta = cur - last;
          last = cur;
          onResize(delta);
        };
        const onUp = () => {
          setActive(false);
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }}
    >
      <div style={{
        position: "absolute",
        [isV ? "left" : "top"]: "50%",
        [isV ? "top" : "left"]: "50%",
        transform: "translate(-50%, -50%)",
        [isV ? "width" : "height"]: 30,
        [isV ? "height" : "width"]: 3,
        borderRadius: 2,
        background: active ? C.accent : C.border,
        transition: "background 0.1s",
      }} />
    </div>
  );
}

function NewTrackDropZone({ height, onDropMedia, dragMediaRef }) {
  const [over, setOver] = useState(false);
  return (
    <div
      style={{
        height, display:"flex", alignItems:"center", justifyContent:"center",
        borderBottom:`1px solid ${C.border}`,
        background: over ? C.dropZone : "transparent",
        border: over ? `2px dashed ${C.accent}40` : `1px dashed ${C.border}`,
        borderRadius: over ? 4 : 0,
        transition:"all 0.15s",
      }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        const mf = dragMediaRef.current;
        if (mf) { onDropMedia(mf); dragMediaRef.current = null; }
      }}
    >
      <span style={{ fontSize:10, color: over ? C.accent : C.dim, fontWeight:500, letterSpacing:"0.04em" }}>
        {over ? "\u2795 Drop to create new track" : "\u2195 Drag media here for new track"}
      </span>
    </div>
  );
}

function Sep() { return <div style={{ width:1, height:20, background:C.border, margin:"0 2px", flexShrink:0 }} />; }

function Pill({ children, c }) {
  return <span style={{ padding:"1px 6px", borderRadius:4, background:c ? `${c}15` : "rgba(255,255,255,0.04)", fontSize:9, color:c || C.textMuted }}>{children}</span>;
}

function TBtn({ icon, label, accent, danger, active, tip, onClick, disabled }) {
  const [h, setH] = useState(false);
  const isActive = active || false;
  const bg = disabled ? "rgba(255,255,255,0.01)"
    : danger ? (h ? "rgba(248,113,113,0.18)" : "rgba(248,113,113,0.06)")
    : isActive ? "rgba(129,140,248,0.18)"
    : accent ? (h ? "rgba(129,140,248,0.22)" : "rgba(129,140,248,0.1)")
    : (h ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.03)");
  return (
    <button title={tip} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      onClick={disabled ? undefined : onClick}
      style={{
        display:"flex", alignItems:"center", gap:3,
        padding: label ? "3px 8px" : "3px 6px",
        background:bg, border:`1px solid ${isActive ? C.accent+"40" : (h ? "rgba(255,255,255,0.08)" : "transparent")}`,
        borderRadius:6, color: disabled ? C.dim : danger ? C.red : (isActive || accent) ? C.accent : C.text,
        cursor: disabled ? "default" : "pointer", fontSize:12, fontFamily:"inherit", transition:"all 0.1s",
        opacity: disabled ? 0.4 : 1,
      }}>
      <span>{icon}</span>
      {label && <span style={{ fontSize:10, fontWeight:500 }}>{label}</span>}
    </button>
  );
}

function MBtn({ children, tip, on, c, onClick }) {
  const [h, setH] = useState(false);
  return (
    <button title={tip} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        width:18, height:18, display:"flex", alignItems:"center", justifyContent:"center",
        borderRadius:3, border:"none", fontSize:8, fontWeight:700,
        background: on ? `${c||C.accent}20` : (h ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)"),
        color: on ? (c||C.accent) : C.textMuted, cursor:"pointer", transition:"all 0.1s",
      }}>{children}</button>
  );
}
