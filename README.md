<div align="center">

# 🎬 streamlit-nle

**A professional non-linear video editor component for Streamlit — multi-track timelines, clip trimming, and transport controls in the browser**

<a href="https://pypi.org/project/streamlit-nle/"><img src="https://img.shields.io/pypi/v/streamlit-nle.svg?style=flat-square&color=818cf8" alt="PyPI version" /></a>
<a href="https://pypi.org/project/streamlit-nle/"><img src="https://img.shields.io/pypi/pyversions/streamlit-nle.svg?style=flat-square" alt="Python versions" /></a>
<a href="https://pypi.org/project/streamlit-nle/"><img src="https://img.shields.io/pypi/dm/streamlit-nle.svg?style=flat-square&color=34d399" alt="Downloads" /></a>
<img src="https://img.shields.io/badge/License-MIT-green.svg?style=flat-square" alt="License" />

</div>

---

`streamlit-nle` is a fully-featured non-linear video editor that runs inside any Streamlit app. Bring real NLE capabilities — multi-track timelines, clip manipulation, transport controls, media management, and keyboard shortcuts — directly into the browser with no server-side dependencies beyond Streamlit.

## ✨ Features

- **Multi-track timeline** — unlimited video & audio tracks
- **Drag-and-drop clip placement** — move clips freely or between tracks
- **Clip trimming** — drag left/right edge of any clip to set in/out points
- **Razor tool** — split a clip at the playhead with one click
- **Snap-to-grid** — clips snap to second boundaries (toggle with `S`)
- **Per-track controls** — Mute, Solo, and Lock buttons
- **Integrated video preview** — preview panel linked to the playhead
- **Real-time audio playback** — HTML5 Audio synced to the timeline clock with drift correction
- **Keyboard shortcuts** — Space (play/pause), J/K/L (shuttle), and more
- **Full state round-trip** — edit decisions returned to Python as structured JSON

## 🚀 Quick Start

```bash
pip install streamlit-nle
```

```python
import streamlit as st
from streamlit_nle import nle

result = nle(
    tracks=[
        {"id": "v1", "type": "video", "label": "Video 1"},
        {"id": "a1", "type": "audio", "label": "Audio 1"},
    ],
    clips=[
        {"id": "c1", "trackId": "v1", "src": "clip.mp4", "start": 0, "duration": 10},
    ]
)
st.write(result)
```

## 🛠️ Tech Stack

- **React + TypeScript** — frontend component
- **HTML5 Audio/Video** — browser-native media playback
- **Python / Streamlit** — backend integration
- **PyPI** — distributed as `streamlit-nle`

## 🤝 Contributing

PRs welcome. Open an issue first for major changes.

## 📄 License

MIT

## 💛 Support

If streamlit-nle powers your video workflow, consider supporting development:

👉 [Donate via PayPal](https://paypal.me/noodlebake) — @noodlebake

🌐 [Portfolio: rhythrosalabs.github.io](https://rhythrosalabs.github.io) (more apps, music and sound design)

---
<div align="center">Made with ❤️ by <a href="https://github.com/RhythrosaLabs">RhythrosaLabs</a></div>
