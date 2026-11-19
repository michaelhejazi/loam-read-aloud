---
id: read-aloud
name: Read aloud
version: 1.1.3
author: Michael Hejazi
api: 0
kind: [extension]
description: "Listen to your agents instead of reading them, each in a voice of its own."
screenshots:
  - {src: assets/shots/read-aloud-menu.webp, src_dark: assets/shots/read-aloud-menu-dark.webp, caption: "Listen to any reply as written, or hear a short Brief of it."}
  - {src: assets/shots/read-aloud-playing.webp, src_dark: assets/shots/read-aloud-playing-dark.webp, caption: "It plays under the reply, and keeps going while you move around."}
  - {src: assets/shots/read-aloud-voice.webp, src_dark: assets/shots/read-aloud-voice-dark.webp, caption: "Give each agent a voice of its own; hear a sample first."}
icon: assets/icon.svg
places: [message.footer.action, files.viewer, app.overlay, settings.section, agent.profile]
agent_settings: [{"id":"voice","label":"Voice","choices":[{"id":"Zephyr","label":"Zephyr · Female"},{"id":"Puck","label":"Puck · Male"},{"id":"Charon","label":"Charon · Male"},{"id":"Kore","label":"Kore · Female"},{"id":"Fenrir","label":"Fenrir · Male"},{"id":"Leda","label":"Leda · Female"},{"id":"Orus","label":"Orus · Male"},{"id":"Aoede","label":"Aoede · Female"},{"id":"Callirrhoe","label":"Callirrhoe · Female"},{"id":"Autonoe","label":"Autonoe · Female"},{"id":"Enceladus","label":"Enceladus · Male"},{"id":"Iapetus","label":"Iapetus · Male"},{"id":"Umbriel","label":"Umbriel · Male"},{"id":"Algieba","label":"Algieba · Male"},{"id":"Despina","label":"Despina · Female"},{"id":"Erinome","label":"Erinome · Female"},{"id":"Algenib","label":"Algenib · Male"},{"id":"Rasalgethi","label":"Rasalgethi · Male"},{"id":"Laomedeia","label":"Laomedeia · Female"},{"id":"Achernar","label":"Achernar · Female"},{"id":"Alnilam","label":"Alnilam · Male"},{"id":"Schedar","label":"Schedar · Male"},{"id":"Gacrux","label":"Gacrux · Female"},{"id":"Pulcherrima","label":"Pulcherrima · Female"},{"id":"Achird","label":"Achird · Male"},{"id":"Zubenelgenubi","label":"Zubenelgenubi · Male"},{"id":"Vindemiatrix","label":"Vindemiatrix · Female"},{"id":"Sadachbia","label":"Sadachbia · Male"},{"id":"Sadaltager","label":"Sadaltager · Male"},{"id":"Sulafat","label":"Sulafat · Female"}],"default":"Charon"}]
keys:
  - provider: google
    why: Makes the speech for replies and files, and the spoken briefs
overrides: []
touches:
  network:
    - host: generativelanguage.googleapis.com
      why: Sends reply or file text from its own server to make speech and spoken briefs
  record: read
  memory: none
  server: true
server:
  run: node server/main.js
contributes: {"settings.entry":[{"key":"voices","label":"Each agent's voice","note":"One entry per agent, agent=Voice:character, separated by semicolons. An agent's own choice on its profile comes first; an agent not listed speaks as Charon.","advanced":true,"default":""}]}
---

Press the speaker under an agent's reply and hear it, in that agent's own
voice, or hear a short spoken summary instead. Your notes in Files can be
read aloud too.

## What you can do

- **Hear any reply.** Listen reads it as written.
- **Get the gist in seconds.** Brief turns a long reply into a short spoken
  summary.
- **Listen to your notes.** Any note in Files can be read aloud, and the
  player keeps going while you move around Loam.
- **A voice for each agent.** Thirty to choose from, with a sample of each
  on the agent's profile.
- **Tables and diagrams, explained.** Instead of reading cells out, it says
  what they show.

## How to use it

1. Add a Google (Gemini) key in **Settings › Connections › API keys**.
2. Press the speaker under a reply, then **Listen** or **Brief**.

---

## Technical details

Text goes from this plugin's own server (`/x/read-aloud/`) to Google's
Gemini, only when you ask to hear it; the browser never receives the key.
Takes are kept for a while, so playing one again is instant. Each agent's
voice is the one chosen on its profile, else the `voices` setting under
Advanced (`agent=Voice:character;…`). When Listen and Brief are offered, the
reading rate, the Files voice and whether tables and diagrams are described
are kept in this browser. Turning it off stops playback and removes its
controls; your preferences are kept.
