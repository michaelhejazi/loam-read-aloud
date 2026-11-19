# Read aloud

Hear your agents' replies and your notes. Each reply gets **Listen**, the
reply as written, and **Brief**, a short spoken summary of it, in the voice
you chose for that agent. Any note in Files can be read aloud too, with a
player that keeps going while you move around Loam.

## What it does

- **Replies**: Listen and Brief under an agent's reply. A take is made once
  and kept, so playing it again is instant.
- **Files**: read a note aloud from its toolbar. Tables and diagrams get a
  sentence or two on what they show (**Describe tables and diagrams**), or
  are skipped with a notice if you turn that off.
- **Voices**: thirty Gemini voices. Each agent has its own, chosen on its
  profile, where you can hear a sample of each first. Files has a voice of
  its own.

## What you need

A Google (Gemini) API key, saved once in Settings › Connections › API keys
(or one for Read aloud alone, with "use a different key" on the same page).
Without one, the controls say that audio is unavailable and keep your
choices for later.

## What it touches

- **generativelanguage.googleapis.com**: the text of a reply or a note goes
  there from this plugin's own server on your Loam, which holds the key,
  only when you ask to hear it. The browser never sees the key.
- **Conversation records, read only**: the replies it reads.
- **Each agent's voice**, kept by your Loam with the agent's profile, so
  your agents can change it too.

## Settings

Settings › Plugins › Read aloud: when Listen and Brief are offered, the
reading rate, the Files voice and whether tables and diagrams are described.
They are kept in this browser, so each device has its own, and they stay if
you turn the plugin off and on again. Agent voices are on each agent's
profile.

## Getting it

In your Loam, open Settings › Market, find Read aloud, and press
**Install**. Or install it from Settings › Plugins with its link:

```
https://github.com/michaelhejazi/loam-read-aloud/tree/v1.1.2
```

## For builders

[PLUGIN.md](PLUGIN.md) is its manifest, with the voices as an
`agent_settings` field. Plain ES modules with no build step and no
dependency: `page/main.js` registers the reply footer, the Files action, the
player and the settings through Loam's plugin interface (API 0). `server/` is
its own small server (Node's standard library and `ffmpeg`), which Loam runs
while the plugin is on and reaches at `/x/read-aloud/`: it makes the speech,
keeps the audio for a while in the plugin's private folder, and holds the
key; the page holds none. Each agent's voice is the one chosen on its
profile, else the `voices` setting (`agent=Voice:character;…`, under
Advanced). `samples/` holds the voice samples the profile plays, one short
take per voice. Needs Loam 0.2.3 or later. Loam's own repository runs this
plugin's tests against its copy in `plugins/_listed/read-aloud/`.

## Made by

Michael Hejazi. Under the AGPL-3.0 ([LICENSE](LICENSE)), as Loam is.
