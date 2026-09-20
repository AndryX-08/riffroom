# RiffPack

Un RiffPack è una cartella pubblicabile insieme al sito. Il file `.riffpack.json` descrive la scena; i due video possono essere file locali nella stessa cartella (`original-video` con audio e `silent-video` senza dialoghi) oppure URL/data URL accessibili dal browser.

```text
packs/il-piano-perfetto/
  il-piano-perfetto.riffpack.json
  original-video.mp4
  silent-video.mp4
```

Il manifest minimo è:

```json
{
  "format": "riffpack",
  "version": 1,
  "title": "Il piano perfetto",
  "originalVideo": "./original-video.mp4",
  "silentVideo": "./silent-video.mp4",
  "duration": 28,
  "lines": [
    {
      "id": "milo-01",
      "speaker": "MILO",
      "text": "Ok, ascoltami bene. Ho un piano.",
      "start": 0.4,
      "end": 3.8,
      "waveform": [0.12, 0.32, 0.7, 0.45, 0.2, 0.56, 0.8, 0.35]
    }
  ]
}
```

`waveform` è una mini-rappresentazione normalizzata dell’ampiezza della voce originale: serve come guida visiva per pause, attacchi e intensità, non come audio riproducibile. La versione multiplayer potrà generarla automaticamente durante l’import e usare `start`/`end` per sincronizzare ogni take.
