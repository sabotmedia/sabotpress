Sabot local speech runtime assets

Voice: Flite cmu_us_lnh (CMU ARCTIC / FestVox)
Flite WASI build: @echogarden/flite-wasi 0.1.1
Browser WASI shim: @bjorn3/browser_wasi_shim 0.4.2

Core runtime assets are required. Voice packs are optional at build time so a temporary upstream mirror outage cannot block deployment of the entire site. Runtime speech text is processed locally in the browser and is not sent to the upstream projects or a speech API.
