# Be My Coach (beta)

A browser-only tennis form coach for the serve, forehand and backhand. Upload or film a side-view video; pose estimation (MediaPipe Pose Landmarker) runs on the device, detects serves, and returns per-item judgements, one weekly task, a 7-day drill schedule and a before/after comparison.

- Videos and records never leave the device (IndexedDB only). No server, no analytics, no external fonts; a CSP blocks all outbound connections (including MediaPipe usage logging).
- UI: Japanese (default) / Korean.
- Judgement ranges are a draft pending coach review.

Third-party: MediaPipe Tasks Vision (Apache-2.0), pose_landmarker_full model (Apache-2.0).
