---
'@livekit/track-processors': patch
---

Fix the processed track freezing for remote participants when the sender minimises or occludes the window in browsers without Insertable Streams (Firefox, Safari): the fallback pipeline's render loop is now driven by a worker timer, which keeps ticking while the document is hidden, instead of requestAnimationFrame, which does not.
