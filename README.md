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
(or a key of Read aloud's own in its settings). Without one, the controls
say that audio is unavailable and keep your choices for later.

## What it touches

- **generativelanguage.googleapis.com**: the text of a reply or a note goes
  there through your Loam's server, which holds the key, only when you ask
  to hear it. The browser never sees the key.
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
https://github.com/michaelhejazi/loam-read-aloud/tree/v1.0.1
```

## For builders

[PLUGIN.md](PLUGIN.md) is its manifest, with the voices as an
`agent_settings` field. It is page code only, plain ES modules with no build
step: `page/main.js` registers the reply footer, the Files action, the player
and the settings through Loam's plugin interface (API 0). Speech is made by
your Loam server's `/api/speech`, which has the key; this plugin holds none.
`samples/` holds the voice samples the profile plays, one short take per
voice. Loam's own repository runs this plugin's tests against its copy in
`plugins/_listed/read-aloud/`.

## Made by

Michael Hejazi. Under the AGPL-3.0 ([LICENSE](LICENSE)), as Loam is.
