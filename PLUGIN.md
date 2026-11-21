---
id: read-aloud
name: Read aloud
version: 1.2.0
author: Michael Hejazi
api: 0
kind: [extension]
description: "Listen to your agents instead of reading them, each in a voice of its own."
screenshots:
  - {src: assets/shots/read-aloud-menu.webp, src_dark: assets/shots/read-aloud-menu-dark.webp, caption: "Listen to any reply as written, or hear a short Brief of it."}
  - {src: assets/shots/read-aloud-playing.webp, src_dark: assets/shots/read-aloud-playing-dark.webp, caption: "It plays under the reply, and keeps going while you move around."}
  - {src: assets/shots/read-aloud-voice.webp, src_dark: assets/shots/read-aloud-voice-dark.webp, caption: "Choose a Google voice and hear its sample."}
  - {src: assets/shots/read-aloud-guide.webp, src_dark: assets/shots/read-aloud-guide-dark.webp, caption: "Add one shared Gemini key in Settings."}
icon: assets/icon.svg
places: [message.footer.action, files.viewer, app.overlay, settings.section, agent.profile]
agent_settings: [{"id":"voice","label":"Voice","choices":[{"id":"Zephyr","label":"Zephyr · Female"},{"id":"Puck","label":"Puck · Male"},{"id":"Charon","label":"Charon · Male"},{"id":"Kore","label":"Kore · Female"},{"id":"Fenrir","label":"Fenrir · Male"},{"id":"Leda","label":"Leda · Female"},{"id":"Orus","label":"Orus · Male"},{"id":"Aoede","label":"Aoede · Female"},{"id":"Callirrhoe","label":"Callirrhoe · Female"},{"id":"Autonoe","label":"Autonoe · Female"},{"id":"Enceladus","label":"Enceladus · Male"},{"id":"Iapetus","label":"Iapetus · Male"},{"id":"Umbriel","label":"Umbriel · Male"},{"id":"Algieba","label":"Algieba · Male"},{"id":"Despina","label":"Despina · Female"},{"id":"Erinome","label":"Erinome · Female"},{"id":"Algenib","label":"Algenib · Male"},{"id":"Rasalgethi","label":"Rasalgethi · Male"},{"id":"Laomedeia","label":"Laomedeia · Female"},{"id":"Achernar","label":"Achernar · Female"},{"id":"Alnilam","label":"Alnilam · Male"},{"id":"Schedar","label":"Schedar · Male"},{"id":"Gacrux","label":"Gacrux · Female"},{"id":"Pulcherrima","label":"Pulcherrima · Female"},{"id":"Achird","label":"Achird · Male"},{"id":"Zubenelgenubi","label":"Zubenelgenubi · Male"},{"id":"Vindemiatrix","label":"Vindemiatrix · Female"},{"id":"Sadachbia","label":"Sadachbia · Male"},{"id":"Sadaltager","label":"Sadaltager · Male"},{"id":"Sulafat","label":"Sulafat · Female"}],"default":"Charon"}]
keys:
  - provider: google
    optional: true
    why: Makes the speech for replies and files, and the spoken briefs
  - provider: openai
    optional: true
    why: Makes speech, summaries and table descriptions when there is no Google key
overrides: []
touches:
  network:
    - host: api.openai.com
      why: Makes speech, summaries and table descriptions with the OpenAI key when there is no Google key
    - host: browser-managed
      why: The browser may use its own remote speech service for a device voice
    - host: generativelanguage.googleapis.com
      why: Sends reply or file text from its own server to make speech and spoken briefs
  record: read
  memory: none
  server: true
server:
  run: node server/main.js
contributes: {"settings.entry":[{"key":"voices","label":"Each agent's voice","note":"One entry per agent, agent=Voice:character, separated by semicolons. An agent's own choice on its profile comes first; an agent not listed speaks as Charon.","advanced":true,"default":""}]}
---

## How to use it

Press the speaker under a reply or in Files and choose Listen. With no key, the player uses your browser’s voice and reads the fixed skip notices for tables and diagrams. A server key adds Brief and generated descriptions.

## What you need, and what leaves your server

Loam uses a Google key first, then an OpenAI key, then the browser. A provider error stays with that provider. Open Settings › Plugins › Read aloud to see the provider. Follow the free Gemini key link, sign in to Google AI Studio, create a key and paste it in the guide. Loam checks it and saves it in Settings › Connections › API keys for both plugins.

Eligible projects get a free quota without setting up billing. Google may use free-tier audio and text to improve its products. Check [availability](https://aistudio.google.com/docs/available-regions) and [your limits](https://aistudio.google.com/rate-limit).

## What it touches

Listen sends text to the selected server provider or browser voice. The Google profile has thirty voice samples. OpenAI shows the corresponding built-in voice names. Browser playback uses the device voice.
