import { browser } from '$app/env';

/**
 * The few sounds a diary makes: a leaf going over, and a seal pressed into
 * wax. They are made as they are needed, from noise, so there is nothing to
 * load.
 *
 * A browser only lets a page make sound once it has been touched. Every sound
 * here follows a press, so the audio context is made on first use.
 */

const REMEMBERED = 'vellum:muted';

class Sound {
	muted = $state(false);

	#context: AudioContext | undefined;
	#noise: AudioBuffer | undefined;

	constructor() {
		if (!browser) return;
		try {
			this.muted = localStorage.getItem(REMEMBERED) === '1';
		} catch {
			// Storage is off limits here; sound starts on.
		}
	}

	toggle() {
		this.muted = !this.muted;
		try {
			localStorage.setItem(REMEMBERED, this.muted ? '1' : '0');
		} catch {
			// Not remembered, then.
		}
		if (!this.muted) this.turn();
	}

	#ready(): AudioContext | null {
		if (!browser || this.muted) return null;
		try {
			this.#context ??= new AudioContext();
			if (this.#context.state === 'suspended') void this.#context.resume();
			if (!this.#noise) {
				const length = this.#context.sampleRate;
				this.#noise = this.#context.createBuffer(1, length, length);
				const samples = this.#noise.getChannelData(0);
				for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
			}
			return this.#context;
		} catch {
			return null;
		}
	}

	/** A breath of filtered noise that starts at `at`, sweeps from one pitch to another, and dies away. */
	#hiss(at: number, length: number, from: number, to: number, gain: number, sharp = 1.2) {
		const context = this.#ready();
		if (!context || !this.#noise) return;
		const start = context.currentTime + at;
		const source = context.createBufferSource();
		source.buffer = this.#noise;
		source.loop = true;
		const filter = context.createBiquadFilter();
		filter.type = 'bandpass';
		filter.Q.value = sharp;
		filter.frequency.setValueAtTime(from, start);
		filter.frequency.exponentialRampToValueAtTime(to, start + length);
		const volume = context.createGain();
		volume.gain.setValueAtTime(0.0001, start);
		volume.gain.exponentialRampToValueAtTime(gain, start + length * 0.18);
		volume.gain.exponentialRampToValueAtTime(0.0001, start + length);
		source.connect(filter).connect(volume).connect(context.destination);
		source.start(start, Math.random() * 0.5);
		source.stop(start + length + 0.05);
	}

	/** A leaf lifted, carried over, and laid down. */
	turn() {
		this.#hiss(0, 0.26, 2600, 900, 0.09);
		this.#hiss(0.3, 0.2, 700, 2200, 0.05);
		this.#hiss(0.62, 0.09, 420, 240, 0.07, 0.8);
	}

	/** The cover coming open: slower and lower than a leaf. */
	open() {
		this.#hiss(0, 0.5, 520, 1500, 0.07, 0.9);
		this.#hiss(1.2, 0.14, 260, 150, 0.12, 0.7);
	}

	/** A die pressed into warm wax. */
	seal() {
		const context = this.#ready();
		if (!context) return;
		const start = context.currentTime;
		const thump = context.createOscillator();
		thump.frequency.setValueAtTime(170, start);
		thump.frequency.exponentialRampToValueAtTime(52, start + 0.2);
		const volume = context.createGain();
		volume.gain.setValueAtTime(0.0001, start);
		volume.gain.exponentialRampToValueAtTime(0.3, start + 0.012);
		volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.34);
		thump.connect(volume).connect(context.destination);
		thump.start(start);
		thump.stop(start + 0.4);
		this.#hiss(0, 0.12, 1800, 500, 0.06);
	}
}

export const sound = new Sound();
