import os
import streamlit.components.v1 as components

_RELEASE = True

if _RELEASE:
    _component_func = components.declare_component(
        "streamlit_video_editor",
        path=os.path.join(os.path.dirname(__file__), "frontend/build"),
    )
else:
    _component_func = components.declare_component(
        "streamlit_video_editor",
        url="http://localhost:3001",
    )


def st_video_editor(tracks=None, height=700, key=None):
    """
    Render a non-linear video editor with multi-track timeline,
    media import, video preview, razor tool, and undo/redo.

    Parameters
    ----------
    tracks : list[dict], optional
        Initial track data. Each track has name, type ('video'|'audio'),
        and clips list.
    height : int
        Component height in pixels.
    key : str, optional
        Streamlit widget key for state isolation.

    Returns
    -------
    dict | None
        Timeline state with tracks, playhead position.
    """
    return _component_func(tracks=tracks, height=height, key=key, default=None)
