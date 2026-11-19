---
id: read-aloud
name: Read aloud
version: 1.1.2
author: Michael Hejazi
api: 0
kind: [extension]
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

Reads replies, briefs and Files aloud. The server contacts the declared speech
provider; the browser never receives its credential. Reply/file text is sent
only when speech is requested. Saved audio and local voice/rate choices retain
their existing lifetimes. Turning this plugin off stops playback and removes
its reader controls and settings. Saved preferences stay in place.

Full describes tables and diagram fences in one or two sentences by default.
“Describe tables and diagrams” in Settings → Plugins → Read aloud
is a device preference beside the Files voice. Turning it off restores skip
notices. Descriptions use the same server-side Gemini key, are cached, and
fall back to skip notices if their writer fails. Ordinary code and Brief keep
their existing behavior.
