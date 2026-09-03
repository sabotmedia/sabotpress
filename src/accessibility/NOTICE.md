# Local speech notices

Sabot's public Read Aloud feature and AudioLab Sabot Voice are intentionally local. They do not call a speech API, neural text-to-speech model, or large language model. The default voice is classic Flite synthesis using the `cmu_us_lnh` voice. Runtime text is processed in the reader's browser.

## Flite and cmu_us_lnh

Sabot uses a WebAssembly build of **Flite** with the CMU/FestVox `cmu_us_lnh` voice. The runtime is prepared at build time and served from Sabot's own origin. The voice and runtime are loaded lazily when speech is first requested.

Flite is distributed under CMU's BSD-like free-software terms:

Language Technologies Institute
Carnegie Mellon University
Copyright (c) 1999-2017
All Rights Reserved.

Permission is granted, free of charge, to use and distribute the software and its documentation without restriction, including the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies, subject to retention of the copyright notice and conditions, clear marking of modifications, preservation of original authors' names, and no use of authors' names for endorsement without prior written permission.

CARNEGIE MELLON UNIVERSITY AND THE CONTRIBUTORS DISCLAIM ALL WARRANTIES, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS, AND SHALL NOT BE LIABLE FOR SPECIAL, INDIRECT OR CONSEQUENTIAL DAMAGES OR LOSS OF USE, DATA OR PROFITS ARISING FROM USE OR PERFORMANCE OF THE SOFTWARE.

Upstream Flite: https://github.com/festvox/flite
WASI build used by Sabot: https://github.com/echogarden-project/flite-wasi
CMU/FestVox voices: http://festvox.org/flite/packed/flite-2.2/voices/

The `cmu_us_lnh` voice is part of the CMU/FestVox voice set derived from the CMU ARCTIC speech resources. CMU ARCTIC materials are distributed under permissive terms requiring attribution.

## Browser WASI shim

Sabot uses `@bjorn3/browser_wasi_shim` to run the Flite WASI executable entirely in the browser. It is dual-licensed under the MIT License or Apache License 2.0.

Upstream: https://github.com/bjorn3/browser_wasi_shim

## Klattsch compatibility fallback

The older Klatt-formant reader remains only as an emergency compatibility fallback if the Flite WebAssembly or voice assets cannot initialize. The formant synthesis primitives and English Klatt 1980 phoneme-bank values in `vendor/` are adapted from **Klattsch** by Tony Gies.

MIT License

Copyright (c) 2026 Tony Gies

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Upstream: https://github.com/tgies/klattsch

## NRL / Elovitz text-to-phoneme rules

The deterministic English letter-to-sound rules used by the compatibility fallback are based on the 1976 Naval Research Laboratory / Elovitz algorithm described in NRL Report 7948, "Automatic translation of English text to phonetics by means of letter-to-sound rules." Rule data was adapted from Greg Kennedy's `p5-NRL-TextToPhoneme` implementation, released under the Unlicense / into the public domain.

Upstream: https://github.com/greg-kennedy/p5-NRL-TextToPhoneme
