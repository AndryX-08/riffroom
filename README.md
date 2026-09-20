# RiffRoom

MVP web originale ispirato al party game di ridoppiaggio: una scena, una battuta alla volta, take vocali e voto finale.

## Oggi funziona

- home cartoonesca responsive con identità visiva propria;
- creazione stanza con codice e ingresso tramite codice;
- lobby fino a 6 giocatori, con ospiti demo per provare il flusso senza backend;
- scelta della scena e delle modalità “ognuno per sé” / “cast condiviso”;
- round con timer, testo delle battute, selezione della battuta e registrazione via `MediaRecorder` quando il browser lo permette;
- fallback simulato per provare il percorso anche senza permesso microfono;
- effetti vocali dimostrativi, playback, voto e risultati.

## Avvio locale

Apri `index.html` con un server statico locale, ad esempio:

```text
python3 -m http.server 4173
```

Poi visita `http://127.0.0.1:4173`.

## Prossimo incremento tecnico

Il prototipo è volutamente frontend-only. Il passo successivo è sostituire lo stato locale con stanze persistenti e sincronizzazione WebSocket/WebRTC, aggiungere upload di clip con diritti verificati, mix audio per take e un export video server-side.

## Clip reali e diritti

La lobby accetta ora un video locale (`video/*`). Il browser lo riproduce nel round con l’audio originale silenziato, mentre le nuove voci vengono registrate dal microfono. Per la versione completa, il mix finale può essere generato collegando il video a Web Audio, sommando le take vocali e registrando il risultato con MediaRecorder. La documentazione MDN descrive sia la cattura di un media element sia la registrazione dello stream risultante.

Usare film o anime commerciali richiede autorizzazione/licenza del titolare dei diritti. Per il catalogo pubblico del sito useremo clip proprie, pubblico dominio o licenze che consentano modifica e redistribuzione; i file caricati localmente restano invece sul dispositivo dell’utente nel prototipo.
# riffroom
# riffroom
