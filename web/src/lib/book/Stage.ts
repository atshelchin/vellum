import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { COVERS } from './covers';
import { CURVE_SIZE, SEGMENTS, restCurve, turnCurve } from './curve';
import { readable, type Face, type Spread } from './faces';
import { DEFAULT_METRICS, metricsFor, PAGE_HEIGHT, PAGE_WIDTH, type Metrics } from './layout';
import {
	paintCover,
	paintCoverMaterial,
	paintFace,
	paintLeatherBump,
	paintPageEdges,
	type Side
} from './paint';

/**
 * The diary as an object: boards, a block of pages, and leaves that turn.
 *
 * Only what is moving is modelled as moving. The block is two stacks, one
 * either side of where the book lies open, each a solid with the facing page
 * painted on top; a leaf exists only while it is in the air, and becomes the
 * top of the stack it lands on. So a diary of ten thousand entries costs what
 * a diary of ten does.
 *
 * Nothing is drawn unless something has changed. A book lying open and being
 * read is a still picture, and is left as one.
 *
 * Lengths are in page widths: a page is 1 wide. The book's own axes are x
 * across the spread, y up off the desk, z down the page from head to tail.
 */

/** What is on the boards. */
export interface Binding {
	title: string;
	cover: number;
	/** How many entries the diary holds, which is how thick its block is. */
	entries: number;
}

/** Who the book asks what comes next, and tells what the reader did. */
export interface Source {
	/** The spread one turn away from where the reader is now, if there is one and it is ready. */
	neighbour(direction: 1 | -1): Spread | null;
	/** A turn has been made: the reader is now on the spread `neighbour` last gave. */
	turned(direction: 1 | -1): void;
	/**
	 * The reader pressed a page that asks to be pressed, or the shut book, or
	 * the desk beside the open one: somewhere that turns no page.
	 */
	tapped(target: Face | 'cover' | 'outside'): void;
}

export interface StageOptions {
	binding: Binding;
	spread: Spread;
	/** Whether the book starts lying open. */
	open: boolean;
	/** Pixels at the top and bottom of the canvas that other things are drawn over. */
	insets?: { top: number; bottom: number };
	/**
	 * The insets the book is read at, where they are not the ones it is shown
	 * at. The writing is sized for these and stays that size: a book that draws
	 * back to make room for a toolbar must not reset its pages to do it.
	 */
	readingInsets?: { top: number; bottom: number };
	/** How far right of centre the shut book sits, as a share of half the width. Wide screens only. */
	shift?: number;
	/** The writing changed size: every spread has to be set again. */
	onLayout?: (metrics: Metrics) => void;
	/** A leaf has left the stack, for whatever accompanies it. */
	onTurn?: () => void;
}

const WIDTH = 1;
const HEIGHT = 1.42;
const BOARD = 0.022;
/** How far the boards reach past the pages. */
const SQUARE = 0.036;
/** The groove between a board and the spine, where the binding folds. */
const JOINT = 0.016;
const BOARD_WIDTH = WIDTH + SQUARE - JOINT;
const BOARD_HEIGHT = HEIGHT + SQUARE * 2;
/** How many strips a leaf is cut into from head to tail. */
const ROWS = 6;
/** Leaves that can be in the air at once. */
const LEAVES = 4;
/** The share of the block that can ever lie on the left: the last page keeps something under it. */
const SHARE = 0.92;
/** How far above a stack a leaf in the air is held, so the two are never one surface. */
const CLEARANCE = 0.0016;
const FOV = 30;
/** How far the open book lies back from facing the reader squarely, in degrees from flat. */
const SPREAD_TILT = 66;
/** One page at a time is held nearer upright: there is less of it to take in. */
const SINGLE_TILT = 76;
const TURN_SECONDS = 0.92;
const RIFFLE_SECONDS = 0.6;
const OPEN_SECONDS = 1.9;
const PAGE_CACHE = 14;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => value * value * (3 - 2 * value);

/** Runs `work` when the browser has a moment. Not every browser can say when that is. */
function whenIdle(work: () => void): number {
	return typeof requestIdleCallback === 'function'
		? requestIdleCallback(work, { timeout: 600 })
		: (setTimeout(work, 120) as unknown as number);
}

function cancelIdle(id: number) {
	if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id);
	else clearTimeout(id);
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** A thicker book for a longer diary, within what still looks like a notebook. */
function thicknessOf(entries: number): number {
	return Math.min(0.15, 0.056 + entries * 0.0016);
}

interface Leaf {
	group: THREE.Group;
	geometry: THREE.BufferGeometry;
	front: THREE.MeshStandardMaterial;
	back: THREE.MeshStandardMaterial;
	busy: boolean;
}

interface Flight {
	leaf: Leaf;
	from: Spread;
	to: Spread;
	direction: 1 | -1;
	/** 0 lying on the right, 1 lying on the left. */
	turn: number;
	/** Which end of the leaf leads, from -1 (head) to 1 (tail): where it was taken hold of. */
	twist: number;
	/** Whether the leaf is going where it was sent, or falling back. */
	commit: boolean;
	/** Set while a hand has hold of it. */
	held: boolean;
	origin: number;
	target: number;
	elapsed: number;
	duration: number;
	delay: number;
}

interface Stack {
	mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material[]>;
	top: THREE.MeshStandardMaterial;
	curve: Float32Array;
	sign: 1 | -1;
}

interface Drag {
	id: number;
	x: number;
	y: number;
	at: number;
	/** Where on the book it began, in the book's own space. */
	local: THREE.Vector3;
	flight: Flight | null;
	/** Pixels of travel that make a whole turn. */
	travel: number;
	moved: boolean;
	lastX: number;
	lastAt: number;
	speed: number;
}

export class BookStage {
	source: Source | null = null;

	#canvas: HTMLCanvasElement;
	#options: StageOptions;
	#renderer: THREE.WebGLRenderer;
	#scene = new THREE.Scene();
	#camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
	#book = new THREE.Group();
	#spinePivot = new THREE.Group();
	#frontPivot = new THREE.Group();
	#key: THREE.DirectionalLight;
	#ground: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial>;

	#binding: Binding;
	#thickness: number;
	#spine: THREE.Mesh | null = null;
	#joints: [THREE.Mesh, THREE.Mesh];
	#frontBoard: THREE.Mesh;
	#backBoard: THREE.Mesh;
	#frontCap: THREE.MeshStandardMaterial;
	#backCap: THREE.MeshStandardMaterial;
	#hide: THREE.MeshStandardMaterial;
	#pastedown: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
	#lining: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
	#ribbon: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
	#right: Stack;
	#left: Stack;
	#leaves: Leaf[] = [];
	#flights: Flight[] = [];

	#current: Spread;
	#metrics: Metrics = DEFAULT_METRICS;
	#single = false;
	#focus: Side = 'right';
	#pages = new Map<string, THREE.CanvasTexture>();
	#pageSize = { width: PAGE_WIDTH, height: PAGE_HEIGHT };
	#anisotropy = 1;

	/** 0 shut, 1 lying open, and where it is heading. */
	#openness: number;
	#opening: { from: number; to: number; elapsed: number; done: () => void } | null = null;
	#leftThickness = 0;
	#rightThickness = 0;
	/** What the camera frames, in the book's space, and what it is moving toward. */
	#frame = { x: 0, halfWidth: 1, halfHeight: 1 };
	/** The parts of the canvas other things are drawn over, as the camera has them now. */
	#margins = { top: 0, bottom: 0 };
	#framed = false;
	#pointer = new THREE.Vector2();
	#sway = new THREE.Vector2();
	#drag: Drag | null = null;
	#calm: boolean;
	#built = false;

	#raf = 0;
	#last = 0;
	#clock = 0;
	#visible = true;
	#idle = 0;
	#resizeObserver: ResizeObserver;
	#intersectionObserver: IntersectionObserver;
	#disposables: { dispose(): void }[] = [];
	#scratch = {
		curve: new Float32Array(CURVE_SIZE),
		flat: new Float32Array(CURVE_SIZE),
		quaternion: new THREE.Quaternion(),
		euler: new THREE.Euler(),
		vector: new THREE.Vector3(),
		corner: new THREE.Vector3(),
		centre: new THREE.Vector3(),
		raycaster: new THREE.Raycaster(),
		plane: new THREE.Plane()
	};

	constructor(canvas: HTMLCanvasElement, options: StageOptions) {
		this.#canvas = canvas;
		this.#options = options;
		this.#binding = options.binding;
		this.#thickness = thicknessOf(options.binding.entries);
		this.#current = options.spread;
		this.#openness = options.open ? 1 : 0;
		this.#calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

		const renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: true,
			alpha: true,
			powerPreference: 'high-performance'
		});
		this.#renderer = renderer;
		// Sharp writing is the point, but past 2x the eye gains nothing and the phone pays for it.
		renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
		renderer.toneMapping = THREE.NeutralToneMapping;
		renderer.toneMappingExposure = 1;
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFShadowMap;
		this.#anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
		// A phone keeps fewer and smaller pages in memory than a desk does.
		const small = Math.min(screen.width, screen.height) < 700;
		if (small)
			this.#pageSize = { width: 896, height: Math.round((896 * PAGE_HEIGHT) / PAGE_WIDTH) };

		// A room to be reflected in the gold, and to fill the shadows.
		const pmrem = new THREE.PMREMGenerator(renderer);
		const room = new RoomEnvironment();
		this.#scene.environment = this.#keep(pmrem.fromScene(room, 0.04)).texture;
		this.#scene.environmentIntensity = 0.62;
		room.dispose();
		pmrem.dispose();

		this.#scene.add(new THREE.HemisphereLight('#fff4e2', '#3a2a22', 0.16));
		// A lamp over the reader's left shoulder.
		const key = new THREE.DirectionalLight('#fff1e0', 0.78);
		key.position.set(-2.6, 3.4, 5.2);
		key.castShadow = true;
		key.shadow.mapSize.setScalar(small ? 1024 : 2048);
		key.shadow.camera.left = key.shadow.camera.bottom = -2;
		key.shadow.camera.right = key.shadow.camera.top = 2;
		key.shadow.camera.near = 1;
		key.shadow.camera.far = 14;
		key.shadow.bias = -0.0005;
		key.shadow.normalBias = 0.012;
		key.shadow.radius = 5;
		this.#key = key;
		const fill = new THREE.DirectionalLight('#b9cdf5', 0.14);
		fill.position.set(3.5, 1.5, 3);
		this.#scene.add(key, fill);

		this.#scene.add(this.#book);
		this.#book.add(this.#spinePivot);
		this.#spinePivot.add(this.#frontPivot);

		const bump = this.#keep(new THREE.CanvasTexture(this.#paint(512, 512, paintLeatherBump)));
		bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
		bump.repeat.set(2.2, 3.1);
		this.#hide = this.#keep(
			new THREE.MeshStandardMaterial({ roughness: 0.6, bumpMap: bump, bumpScale: 1.6 })
		);
		this.#frontCap = this.#keep(
			new THREE.MeshStandardMaterial({ bumpMap: bump, bumpScale: 1.6, metalness: 1, roughness: 1 })
		);
		this.#backCap = this.#keep(
			new THREE.MeshStandardMaterial({ bumpMap: bump, bumpScale: 1.6, metalness: 1, roughness: 1 })
		);

		const board = this.#keep(boardGeometry());
		this.#backBoard = new THREE.Mesh(board, [this.#backCap, this.#hide]);
		// The front board is the back one seen in a mirror, hung from the far side of the spine.
		this.#frontBoard = new THREE.Mesh(board, [this.#frontCap, this.#hide]);
		this.#frontBoard.scale.x = -1;
		this.#frontBoard.position.x = -JOINT;
		this.#frontPivot.add(this.#frontBoard);
		this.#book.add(this.#backBoard);
		for (const mesh of [this.#backBoard, this.#frontBoard]) {
			mesh.castShadow = true;
			mesh.receiveShadow = true;
		}
		// The leather runs on from each board to the spine, across the groove the
		// binding folds along.
		const joint = this.#keep(new THREE.BoxGeometry(JOINT + 0.008, BOARD * 0.5, BOARD_HEIGHT));
		this.#joints = [new THREE.Mesh(joint, this.#hide), new THREE.Mesh(joint, this.#hide)];
		this.#joints[0].position.set(-JOINT / 2, -BOARD * 0.5, 0);
		this.#frontPivot.add(this.#joints[0]);
		this.#book.add(this.#joints[1]);

		// The paper pasted inside each board. The front one carries the owner's
		// plate, and is the left-hand page of the title spread.
		const inside = this.#keep(
			new THREE.PlaneGeometry(BOARD_WIDTH + JOINT - 0.016, BOARD_HEIGHT - 0.036)
		);
		inside.rotateX(-Math.PI / 2);
		this.#pastedown = new THREE.Mesh(
			inside,
			this.#keep(new THREE.MeshStandardMaterial({ roughness: 0.94 }))
		);
		// It runs on past the board, over the joint, to where the pages meet.
		this.#pastedown.position.set(-(BOARD_WIDTH + JOINT - 0.016) / 2, 0.0007, 0);
		this.#pastedown.receiveShadow = true;
		this.#frontPivot.add(this.#pastedown);
		this.#lining = new THREE.Mesh(
			inside,
			this.#keep(new THREE.MeshStandardMaterial({ roughness: 0.94 }))
		);
		this.#lining.receiveShadow = true;
		this.#book.add(this.#lining);

		const edges = this.#keep(new THREE.CanvasTexture(this.#paint(8, 256, paintPageEdges)));
		edges.colorSpace = THREE.SRGBColorSpace;
		edges.wrapS = edges.wrapT = THREE.RepeatWrapping;
		const edgeMaterial = this.#keep(new THREE.MeshStandardMaterial({ map: edges, roughness: 0.9 }));
		this.#right = this.#buildStack(1, edgeMaterial);
		this.#left = this.#buildStack(-1, edgeMaterial);
		for (let i = 0; i < LEAVES; i++) this.#leaves.push(this.#buildLeaf());

		this.#ribbon = new THREE.Mesh(
			this.#keep(ribbonGeometry()),
			this.#keep(new THREE.MeshStandardMaterial({ roughness: 0.55, side: THREE.DoubleSide }))
		);
		this.#ribbon.castShadow = true;
		this.#book.add(this.#ribbon);

		// The desk, of which only the shadow on it is seen.
		const ground = this.#keep(new THREE.PlaneGeometry(12, 12));
		ground.rotateX(-Math.PI / 2);
		this.#ground = new THREE.Mesh(ground, this.#keep(new THREE.ShadowMaterial({ opacity: 0 })));
		this.#ground.position.y = -BOARD - 0.004;
		this.#ground.receiveShadow = true;
		this.#book.add(this.#ground);

		this.#bind();
		[this.#leftThickness, this.#rightThickness] = this.#restThickness();

		this.#resizeObserver = new ResizeObserver(() => this.#resize());
		this.#resizeObserver.observe(canvas);
		this.#intersectionObserver = new IntersectionObserver(([entry]) => {
			this.#visible = entry.isIntersecting;
			if (this.#visible) this.#invalidate();
		});
		this.#intersectionObserver.observe(canvas);
		document.addEventListener('visibilitychange', this.#onVisibility);
		canvas.addEventListener('pointerdown', this.#onPress);
		canvas.addEventListener('pointermove', this.#onMove);
		canvas.addEventListener('pointerup', this.#onRelease);
		canvas.addEventListener('pointercancel', this.#onRelease);
		canvas.addEventListener('pointerleave', this.#onLeave);
		canvas.addEventListener('webglcontextrestored', this.#onRestored);

		this.#resize();
		this.#built = true;
		this.#dress();

		// A leaf's two sides are drawn by programs of their own, which the
		// graphics card would otherwise build on the first frame of the first
		// turn. Given a page to wear, they are built now, with everything else.
		for (const leaf of this.#leaves) leaf.front.map = leaf.back.map = this.#right.top.map;
		this.#advanceCamera(0, 0);
		renderer.compile(this.#scene, this.#camera);
	}

	/** How the pages are set for this screen. */
	get metrics(): Metrics {
		return this.#metrics;
	}

	get isOpen(): boolean {
		return this.#openness === 1 && !this.#opening;
	}

	/** Whether pages are shown one at a time, and which one is. */
	get focus(): Side | null {
		return this.#single ? this.#focus : null;
	}

	setBinding(binding: Binding) {
		const changed =
			binding.title !== this.#binding.title ||
			binding.cover !== this.#binding.cover ||
			thicknessOf(binding.entries) !== this.#thickness;
		this.#binding = binding;
		if (!changed) return;
		this.#thickness = thicknessOf(binding.entries);
		this.#bind();
		if (this.#flights.length === 0) {
			[this.#leftThickness, this.#rightThickness] = this.#restThickness();
		}
		this.#invalidate();
	}

	setInsets(insets: { top: number; bottom: number }) {
		const before = this.#options.insets;
		if (before && before.top === insets.top && before.bottom === insets.bottom) return;
		this.#options.insets = insets;
		// How much room the book has decides how large it is, and so how it is
		// set, unless it has been told what room to be set for.
		if (!this.#options.readingInsets) this.#layout();
		this.#invalidate();
	}

	/** Puts the book on a spread at once, with nothing in the air. */
	show(spread: Spread, focus?: Side) {
		for (const flight of this.#flights) this.#release(flight.leaf);
		this.#flights = [];
		this.#current = spread;
		if (focus) this.#focus = focus;
		else if (this.#single)
			this.#focus = readable(spread.left) && !readable(spread.right) ? 'left' : 'right';
		[this.#leftThickness, this.#rightThickness] = this.#restThickness();
		this.#dress();
		this.#prepare();
	}

	/** Opens the shut book. Resolves when it lies flat. */
	open(): Promise<void> {
		return this.#swing(1);
	}

	close(): Promise<void> {
		return this.#swing(0);
	}

	/**
	 * Goes one step the way a reader would: the next page, which on a narrow
	 * screen is sometimes the other half of the same spread. Returns whether
	 * there was anywhere to go.
	 */
	step(direction: 1 | -1): boolean {
		if (!this.isOpen || this.#drag?.flight) return false;
		if (this.#single && this.#flights.length === 0) {
			const other = direction === 1 ? this.#current.right : this.#current.left;
			if (this.#focus === (direction === 1 ? 'left' : 'right') && readable(other)) {
				this.#focus = direction === 1 ? 'right' : 'left';
				this.#invalidate();
				return true;
			}
		}
		return this.#launch(direction) !== null;
	}

	/**
	 * Leafs through to a spread that is not next door: a few blank leaves go
	 * over, and the last one lands on it. The reader is told nothing; whoever
	 * calls this already knows where it is going.
	 */
	leafTo(spread: Spread, direction: 1 | -1) {
		// With leaves already in the air there are none to spare for a flourish.
		if (!this.isOpen || this.#flights.length > 0) return this.show(spread);
		const from = this.#current;
		const blank: Face = { key: 'blank', kind: 'blank', mark: false };
		const between = this.#calm ? 0 : 2;
		let previous = from;
		for (let i = 1; i <= between + 1; i++) {
			const last = i === between + 1;
			const to: Spread = last
				? spread
				: {
						key: `riffle:${i}`,
						left: blank,
						right: blank,
						progress: from.progress + ((spread.progress - from.progress) * i) / (between + 1)
					};
			this.#fly(previous, to, direction, RIFFLE_SECONDS, (i - 1) * 0.13);
			previous = to;
		}
		if (this.#single) this.#focus = this.#landingFocus(spread, direction);
		this.#options.onTurn?.();
	}

	dispose() {
		cancelAnimationFrame(this.#raf);
		cancelIdle(this.#idle);
		this.#opening?.done();
		this.#resizeObserver.disconnect();
		this.#intersectionObserver.disconnect();
		document.removeEventListener('visibilitychange', this.#onVisibility);
		const canvas = this.#canvas;
		canvas.removeEventListener('pointerdown', this.#onPress);
		canvas.removeEventListener('pointermove', this.#onMove);
		canvas.removeEventListener('pointerup', this.#onRelease);
		canvas.removeEventListener('pointercancel', this.#onRelease);
		canvas.removeEventListener('pointerleave', this.#onLeave);
		canvas.removeEventListener('webglcontextrestored', this.#onRestored);
		for (const texture of this.#pages.values()) texture.dispose();
		for (const item of this.#disposables) item.dispose();
		this.#spine?.geometry.dispose();
		this.#frontCap.map?.dispose();
		this.#frontCap.roughnessMap?.dispose();
		this.#backCap.map?.dispose();
		this.#backCap.roughnessMap?.dispose();
		this.#renderer.dispose();
	}

	// ── Building ────────────────────────────────────────────────────────────

	#keep<T extends { dispose(): void }>(item: T): T {
		this.#disposables.push(item);
		return item;
	}

	#paint(width: number, height: number, painter: (canvas: HTMLCanvasElement) => void) {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		painter(canvas);
		return canvas;
	}

	#buildStack(sign: 1 | -1, edges: THREE.Material): Stack {
		const points = SEGMENTS + 1;
		const count = points * 6 + 4;
		const geometry = this.#keep(new THREE.BufferGeometry());
		geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
		geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));

		// The top is one sheet of points, two to a step. The head and tail are
		// each a strip between the top's edge and the foot of the stack, and the
		// fore-edge is a single slanting face. A mirrored stack is wound the
		// other way, so that both face outward.
		const index: number[] = [];
		const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
			if (flip) index.push(a, c, b, b, c, d);
			else index.push(a, b, c, b, d, c);
		};
		for (let i = 0; i < SEGMENTS; i++) {
			quad(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 3, sign === -1);
		}
		const head = points * 2;
		const tail = points * 4;
		for (let i = 0; i < SEGMENTS; i++) {
			quad(head + i * 2, head + i * 2 + 2, head + i * 2 + 1, head + i * 2 + 3, sign === -1);
			quad(tail + i * 2, tail + i * 2 + 1, tail + i * 2 + 2, tail + i * 2 + 3, sign === -1);
		}
		const fore = points * 6;
		quad(fore, fore + 1, fore + 2, fore + 3, sign === 1);
		geometry.setIndex(index);
		geometry.addGroup(0, SEGMENTS * 6, 0);
		geometry.addGroup(SEGMENTS * 6, index.length - SEGMENTS * 6, 1);

		const top = this.#keep(new THREE.MeshStandardMaterial({ roughness: 0.93 }));
		// Held a hair behind a leaf lying on it, whatever the depth buffer makes of the two.
		top.polygonOffset = true;
		top.polygonOffsetFactor = 1;
		top.polygonOffsetUnits = 2;
		const mesh = new THREE.Mesh(geometry, [top, edges]);
		mesh.frustumCulled = false;
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		this.#book.add(mesh);
		return { mesh, top, curve: new Float32Array(CURVE_SIZE), sign };
	}

	#buildLeaf(): Leaf {
		const columns = SEGMENTS + 1;
		const count = columns * (ROWS + 1);
		const position = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
		const normal = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
		const uvFront = new Float32Array(count * 2);
		const uvBack = new Float32Array(count * 2);
		const index: number[] = [];
		for (let row = 0; row <= ROWS; row++) {
			for (let column = 0; column <= SEGMENTS; column++) {
				const at = row * columns + column;
				uvFront[at * 2] = column / SEGMENTS;
				// The other side of the leaf is read with the binding on its right.
				uvBack[at * 2] = 1 - column / SEGMENTS;
				uvFront[at * 2 + 1] = uvBack[at * 2 + 1] = 1 - row / ROWS;
				if (row < ROWS && column < SEGMENTS) {
					index.push(at, at + columns, at + 1, at + columns, at + columns + 1, at + 1);
				}
			}
		}

		const geometry = this.#keep(new THREE.BufferGeometry());
		geometry.setAttribute('position', position);
		geometry.setAttribute('normal', normal);
		geometry.setAttribute('uv', new THREE.BufferAttribute(uvFront, 2));
		geometry.setIndex(index);
		// The same points, seen from behind.
		const reverse = this.#keep(new THREE.BufferGeometry());
		reverse.setAttribute('position', position);
		reverse.setAttribute('normal', normal);
		reverse.setAttribute('uv', new THREE.BufferAttribute(uvBack, 2));
		reverse.setIndex(index);

		const front = this.#keep(new THREE.MeshStandardMaterial({ roughness: 0.93 }));
		const back = this.#keep(
			new THREE.MeshStandardMaterial({ roughness: 0.93, side: THREE.BackSide })
		);
		front.shadowSide = THREE.DoubleSide;
		const group = new THREE.Group();
		const upper = new THREE.Mesh(geometry, front);
		const under = new THREE.Mesh(reverse, back);
		upper.castShadow = true;
		upper.receiveShadow = under.receiveShadow = true;
		upper.frustumCulled = under.frustumCulled = false;
		group.add(upper, under);
		group.visible = false;
		this.#book.add(group);
		return { group, geometry, front, back, busy: false };
	}

	/** Dresses the boards for the diary: its leather, its title, a spine as thick as its pages. */
	#bind() {
		const { title, cover } = this.#binding;
		const style = COVERS[cover % COVERS.length];
		const size = { width: this.#pageSize.width, height: this.#pageSize.height };

		const dress = (material: THREE.MeshStandardMaterial, text: string | null) => {
			material.map?.dispose();
			material.roughnessMap?.dispose();
			const colour = new THREE.CanvasTexture(
				this.#paint(size.width, size.height, (canvas) => paintCover(canvas, cover, text))
			);
			colour.colorSpace = THREE.SRGBColorSpace;
			colour.anisotropy = this.#anisotropy;
			// One picture says both how rough the board is and where it is gold.
			const surface = new THREE.CanvasTexture(
				this.#paint(size.width / 2, size.height / 2, (canvas) =>
					paintCoverMaterial(canvas, cover, text)
				)
			);
			surface.anisotropy = this.#anisotropy;
			material.map = colour;
			material.roughnessMap = material.metalnessMap = surface;
			material.needsUpdate = true;
		};
		dress(this.#frontCap, title);
		dress(this.#backCap, null);
		this.#hide.color.set(style.leather).multiplyScalar(0.82);
		this.#hide.roughness = style.roughness;
		this.#lining.material.color.set(style.endpaper);
		this.#ribbon.material.color.set(style.ribbon).multiplyScalar(0.5);

		const spine = this.#thickness;
		this.#spine?.geometry.dispose();
		this.#spine?.removeFromParent();
		this.#spine = new THREE.Mesh(
			new THREE.BoxGeometry(spine, BOARD * 0.8, BOARD_HEIGHT),
			this.#hide
		);
		this.#spine.position.set(-spine / 2, -BOARD * 0.5, 0);
		this.#spine.castShadow = this.#spine.receiveShadow = true;
		this.#spinePivot.add(this.#spine);
		this.#spinePivot.position.x = spine / 2;
		this.#frontPivot.position.x = -spine;
		this.#backBoard.position.x = spine / 2 + JOINT;
		this.#joints[1].position.set(spine / 2 + JOINT / 2, -BOARD * 0.5, 0);
		this.#lining.position.set(spine / 2 + (BOARD_WIDTH + JOINT - 0.016) / 2, 0.0007, 0);
	}

	// ── Pages ───────────────────────────────────────────────────────────────

	#page(face: Face, side: Side): THREE.CanvasTexture {
		const key = `${face.key}|${side}|${this.#metrics.name}`;
		const known = this.#pages.get(key);
		if (known) {
			// Asked for again: it goes to the back of the queue for forgetting.
			this.#pages.delete(key);
			this.#pages.set(key, known);
			return known;
		}
		const canvas = this.#paint(this.#pageSize.width, this.#pageSize.height, (target) =>
			paintFace(target, face, this.#metrics, side)
		);
		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.anisotropy = this.#anisotropy;
		// Sent to the graphics card now, while nothing is moving, and not on the
		// first frame of the turn that needs it. Once it is there the canvas has
		// done its work, and a canvas this size is not worth keeping twice.
		this.#renderer.initTexture(texture);
		canvas.width = canvas.height = 0;
		this.#pages.set(key, texture);
		return texture;
	}

	/** Forgets the pages nobody has asked for lately, never one that is showing. */
	#forget() {
		if (this.#pages.size <= PAGE_CACHE) return;
		const showing = new Set<THREE.Texture | null>([
			this.#left.top.map,
			this.#right.top.map,
			this.#pastedown.material.map
		]);
		for (const leaf of this.#leaves) {
			if (leaf.busy) showing.add(leaf.front.map).add(leaf.back.map);
		}
		for (const [key, texture] of this.#pages) {
			if (this.#pages.size <= PAGE_CACHE) break;
			if (showing.has(texture)) continue;
			texture.dispose();
			this.#pages.delete(key);
		}
	}

	/** Puts the right page on everything that shows one. */
	#dress() {
		const flights = this.#flights;
		let left = this.#current.left;
		let right = this.#current.right;
		if (flights.length > 0) {
			// Leaves in the air came off one stack and have not reached the other:
			// the stack they left shows what was under the last of them, and the
			// stack they are bound for still shows what the first will cover.
			const first = flights[0];
			const last = flights[flights.length - 1];
			if (first.direction === 1) {
				left = first.from.left;
				right = last.to.right;
			} else {
				right = first.from.right;
				left = last.to.left;
			}
		}
		const set = (material: THREE.MeshStandardMaterial, face: Face, side: Side) => {
			const texture = this.#page(face, side);
			if (material.map === texture) return;
			const fresh = material.map === null;
			material.map = texture;
			if (fresh) material.needsUpdate = true;
		};
		// The front board's own paper is the left page until a leaf lies over it.
		if (left.kind === 'bookplate') {
			set(this.#pastedown.material, left, 'left');
			set(this.#left.top, left, 'left');
		} else {
			set(this.#left.top, left, 'left');
		}
		set(this.#right.top, right, 'right');
		for (const flight of flights) {
			const forward = flight.direction === 1;
			set(flight.leaf.front, forward ? flight.from.right : flight.to.right, 'right');
			set(flight.leaf.back, forward ? flight.to.left : flight.from.left, 'left');
		}
		this.#forget();
		this.#invalidate();
	}

	/** While nothing is happening, paints the pages a turn either way would need. */
	#prepare() {
		cancelIdle(this.#idle);
		this.#idle = whenIdle(() => {
			if (this.#flights.length > 0 || !this.source) return;
			for (const direction of [1, -1] as const) {
				const spread = this.source.neighbour(direction);
				if (!spread) continue;
				this.#page(spread.left, 'left');
				this.#page(spread.right, 'right');
			}
			this.#forget();
		});
	}

	// ── Turning ─────────────────────────────────────────────────────────────

	#landingFocus(spread: Spread, direction: 1 | -1): Side {
		if (direction === 1) return readable(spread.left) ? 'left' : 'right';
		return readable(spread.right) ? 'right' : 'left';
	}

	/** Sends a leaf over to the next spread, if there is one. */
	#launch(direction: 1 | -1, held = false): Flight | null {
		const source = this.source;
		if (!source) return null;
		// Leaves already in the air are all going one way. One going the other
		// would have to pass through them.
		if (this.#flights.some((flight) => flight.direction !== direction)) return null;
		const to = source.neighbour(direction);
		if (!to) return null;
		const from = this.#flights.at(-1)?.to ?? this.#current;
		const flight = this.#fly(from, to, direction, TURN_SECONDS, 0, held);
		if (!flight) return null;
		if (!held) {
			source.turned(direction);
			if (this.#single) this.#focus = this.#landingFocus(to, direction);
			this.#options.onTurn?.();
		}
		return flight;
	}

	#fly(
		from: Spread,
		to: Spread,
		direction: 1 | -1,
		seconds: number,
		delay = 0,
		held = false
	): Flight | null {
		const leaf = this.#leaves.find((candidate) => !candidate.busy);
		if (!leaf) return null;
		leaf.busy = true;
		const start = direction === 1 ? 0 : 1;
		const flight: Flight = {
			leaf,
			from,
			to,
			direction,
			turn: start,
			twist: 0.35,
			commit: true,
			held,
			origin: start,
			target: 1 - start,
			elapsed: 0,
			duration: this.#calm ? 0.28 : seconds,
			delay
		};
		this.#flights.push(flight);
		this.#dress();
		return flight;
	}

	#release(leaf: Leaf) {
		leaf.busy = false;
		leaf.group.visible = false;
	}

	#land(flight: Flight) {
		this.#flights.splice(this.#flights.indexOf(flight), 1);
		this.#release(flight.leaf);
		if (flight.commit) this.#current = flight.to;
		this.#dress();
		if (this.#flights.length === 0) this.#prepare();
	}

	#advanceFlights(delta: number): boolean {
		// Copied, because a leaf that lands takes itself out of the list.
		for (const flight of [...this.#flights]) {
			if (flight.held) continue;
			if (flight.delay > 0) {
				flight.delay -= delta;
				continue;
			}
			flight.elapsed += delta;
			const t = clamp01(flight.elapsed / flight.duration);
			const eased = flight.origin === 0 || flight.origin === 1 ? easeInOut(t) : easeOut(t);
			flight.turn = flight.origin + (flight.target - flight.origin) * eased;
			if (t >= 1) this.#land(flight);
		}
		return this.#flights.length > 0;
	}

	// ── Shape ───────────────────────────────────────────────────────────────

	/** How thick each stack is when nothing is in the air. */
	#restThickness(): [number, number] {
		const left = this.#thickness * SHARE * this.#current.progress;
		return [left, this.#thickness - left];
	}

	#advanceStacks(delta: number): boolean {
		let [left, right] = this.#restThickness();
		const flights = this.#flights;
		if (flights.length > 0) {
			// A leaf in the air belongs to neither stack: the one it left has
			// already lost it, and the one it is bound for has yet to gain it.
			const lying = (spread: Spread) => this.#thickness * SHARE * spread.progress;
			const first = flights[0];
			const last = flights[flights.length - 1];
			if (first.direction === 1) {
				left = lying(first.from);
				right = this.#thickness - lying(last.to);
			} else {
				left = lying(last.to);
				right = this.#thickness - lying(first.from);
			}
		}
		const ease = 1 - Math.exp(-delta * 9);
		const before = this.#leftThickness + this.#rightThickness;
		this.#leftThickness += (left - this.#leftThickness) * ease;
		this.#rightThickness += (right - this.#rightThickness) * ease;
		const settled =
			Math.abs(left - this.#leftThickness) + Math.abs(right - this.#rightThickness) < 0.00004;
		if (settled) {
			this.#leftThickness = left;
			this.#rightThickness = right;
		}
		return !settled || before !== this.#leftThickness + this.#rightThickness;
	}

	/** Where across the book the pages meet: it moves left to right as the book is read. */
	#gutter(swing: number): number {
		const lying = -this.#thickness / 2 + this.#leftThickness;
		// Shut, the block sits square against the spine.
		return this.#thickness / 2 + (lying - this.#thickness / 2) * swing;
	}

	#shape() {
		const swing = smooth(clamp01((this.#openness - 0.18) / 0.82));
		const angle = (1 - swing) * (Math.PI / 2);
		this.#spinePivot.rotation.z = -angle;
		this.#frontPivot.rotation.z = -angle;
		const gutter = this.#gutter(swing);

		this.#shapeStack(this.#right, this.#rightThickness, swing, gutter, this.#thickness / 2 + WIDTH);
		// Nothing lies on the left until the first leaf has gone over.
		this.#left.mesh.visible = this.#leftThickness > 0.0006 && swing === 1;
		if (this.#left.mesh.visible) {
			this.#shapeStack(this.#left, this.#leftThickness, 1, gutter, this.#thickness / 2 + WIDTH);
		} else {
			restCurve(0, 1, WIDTH, this.#left.curve);
		}

		// Leaves waiting to go lie one on another, the first to leave on top.
		this.#flights.forEach((flight, index) =>
			this.#shapeLeaf(flight, gutter, CLEARANCE * (this.#flights.length - index))
		);

		// The ribbon is sewn in at the head and lies in the gutter.
		this.#ribbon.position.set(gutter + 0.014, 0.006, 0);
		this.#ribbon.visible = swing === 1;
		this.#ground.material.opacity = 0.34 * smooth(clamp01(this.#openness * 1.6 - 0.3));
	}

	#shapeStack(stack: Stack, thickness: number, swing: number, gutter: number, foot: number) {
		const { curve, sign, mesh } = stack;
		restCurve(thickness, swing, WIDTH, curve);
		const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
		const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
		const points = SEGMENTS + 1;
		const half = HEIGHT / 2;
		// The foot of the stack runs from the gutter out to where its lowest page ends.
		const reach = foot - sign * gutter;
		/** How many of the edge texture's lines a page width of thickness would show. */
		const lines = 5;

		for (let i = 0; i < points; i++) {
			const x = sign * curve[i * 2];
			const y = curve[i * 2 + 1];
			const along = i / SEGMENTS;
			const footX = sign * reach * along;
			position.setXYZ(i * 2, x, y, -half);
			position.setXYZ(i * 2 + 1, x, y, half);
			uv.setXY(i * 2, sign === 1 ? along : 1 - along, 1);
			uv.setXY(i * 2 + 1, sign === 1 ? along : 1 - along, 0);

			const head = points * 2 + i * 2;
			position.setXYZ(head, x, y, -half);
			position.setXYZ(head + 1, footX, 0, -half);
			uv.setXY(head, along, y * lines);
			uv.setXY(head + 1, along, 0);
			const tail = points * 4 + i * 2;
			position.setXYZ(tail, x, y, half);
			position.setXYZ(tail + 1, footX, 0, half);
			uv.setXY(tail, along, y * lines);
			uv.setXY(tail + 1, along, 0);
		}
		const edgeX = sign * curve[SEGMENTS * 2];
		const edgeY = curve[SEGMENTS * 2 + 1];
		const fore = points * 6;
		position.setXYZ(fore, edgeX, edgeY, half);
		position.setXYZ(fore + 1, edgeX, edgeY, -half);
		position.setXYZ(fore + 2, sign * reach, 0, half);
		position.setXYZ(fore + 3, sign * reach, 0, -half);
		uv.setXY(fore, 0, edgeY * lines);
		uv.setXY(fore + 1, 1, edgeY * lines);
		uv.setXY(fore + 2, 0, 0);
		uv.setXY(fore + 3, 1, 0);

		position.needsUpdate = true;
		uv.needsUpdate = true;
		mesh.geometry.computeVertexNormals();
		mesh.position.x = gutter;
	}

	#shapeLeaf(flight: Flight, gutter: number, clearance: number) {
		const { leaf } = flight;
		const position = leaf.geometry.getAttribute('position') as THREE.BufferAttribute;
		const curve = this.#scratch.curve;
		const columns = SEGMENTS + 1;
		// A leaf is taken by a corner, so one end of it is always a little ahead.
		const lead = Math.sin(Math.PI * clamp01(flight.turn)) * 0.11 * flight.twist;
		for (let row = 0; row <= ROWS; row++) {
			const down = row / ROWS - 0.5;
			turnCurve(this.#right.curve, this.#left.curve, clamp01(flight.turn + lead * down * 2), curve);
			for (let column = 0; column < columns; column++) {
				position.setXYZ(
					row * columns + column,
					curve[column * 2],
					curve[column * 2 + 1] + clearance,
					down * HEIGHT
				);
			}
		}
		position.needsUpdate = true;
		leaf.geometry.computeVertexNormals();
		leaf.group.position.x = gutter;
		leaf.group.visible = true;
	}

	// ── Opening ─────────────────────────────────────────────────────────────

	#swing(to: 0 | 1): Promise<void> {
		this.#opening?.done();
		if (this.#openness === to) return Promise.resolve();
		if (this.#calm) {
			this.#openness = to;
			this.#invalidate();
			return Promise.resolve();
		}
		return new Promise((done) => {
			this.#opening = { from: this.#openness, to, elapsed: 0, done };
			this.#invalidate();
		});
	}

	#advanceOpening(delta: number): boolean {
		const opening = this.#opening;
		if (!opening) return false;
		opening.elapsed += delta;
		const t = clamp01(opening.elapsed / OPEN_SECONDS);
		this.#openness = opening.from + (opening.to - opening.from) * easeInOut(t);
		if (t < 1) return true;
		this.#openness = opening.to;
		this.#opening = null;
		opening.done();
		this.#prepare();
		return false;
	}

	// ── Camera ──────────────────────────────────────────────────────────────

	#resize() {
		const width = this.#canvas.clientWidth;
		const height = this.#canvas.clientHeight;
		if (width === 0 || height === 0) return;
		this.#renderer.setSize(width, height, false);
		this.#camera.aspect = width / height;
		this.#camera.updateProjectionMatrix();

		// Two pages side by side need a screen wider than it is tall. On anything
		// narrower one page fills it.
		this.#single = width / height < 1.05;
		this.#layout();
		this.#framed = false;
		this.#invalidate();
	}

	/** How many CSS pixels wide a page is once the book lies open in the room it has. */
	#pageWidth(): number {
		const width = this.#canvas.clientWidth;
		const height = this.#canvas.clientHeight;
		const insets = this.#options.readingInsets ?? this.#options.insets ?? { top: 0, bottom: 0 };
		const tilt = THREE.MathUtils.degToRad(this.#single ? SINGLE_TILT : SPREAD_TILT);
		const halfWidth = this.#single ? WIDTH / 2 + 0.03 : WIDTH + SQUARE + this.#thickness / 2 + 0.03;
		const halfHeight = (this.#single ? HEIGHT : BOARD_HEIGHT) / 2 + 0.03;
		const slope = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
		const room = Math.max(0.2, (height - insets.top - insets.bottom) / height);
		// The same fit the camera makes, for the book lying open.
		const distance =
			Math.max(
				halfWidth / (slope * (width / height) * 0.94),
				(halfHeight * Math.sin(tilt)) / (slope * room)
			) +
			halfHeight * Math.cos(tilt);
		return height / (2 * distance * slope);
	}

	/** Sets the pages for the size they will be read at, and says so if that has changed. */
	#layout() {
		if (this.#canvas.clientWidth === 0 || this.#canvas.clientHeight === 0) return;
		const metrics = metricsFor(this.#pageWidth());
		if (metrics === this.#metrics) return;
		this.#metrics = metrics;
		for (const texture of this.#pages.values()) texture.dispose();
		this.#pages.clear();
		for (const material of [this.#left.top, this.#right.top, this.#pastedown.material]) {
			material.map = null;
		}
		if (this.#built) {
			this.#options.onLayout?.(metrics);
			this.#dress();
		}
	}

	#advanceCamera(delta: number, time: number): boolean {
		const openness = this.#openness;
		const pose = smooth(clamp01(openness * 1.35));
		const spine = this.#thickness;
		const height = this.#canvas.clientHeight;
		const wide = this.#camera.aspect > 1.18;

		// The shut book stands, turned a little so its pages' edge shows. Open, it
		// lies back just far enough to still be a thing on a desk.
		const { quaternion, euler, corner } = this.#scratch;
		const drift = this.#calm ? 0 : 1 - pose;
		euler.set(
			THREE.MathUtils.degToRad(101) +
				Math.sin(time * 0.7) * 0.035 * drift -
				this.#sway.y * 0.07 * drift,
			-0.6 + Math.sin(time * 0.5) * 0.07 * drift + this.#sway.x * 0.16 * drift,
			0.045 * drift,
			'YXZ'
		);
		this.#book.quaternion.setFromEuler(euler);
		euler.set(THREE.MathUtils.degToRad(this.#single ? SINGLE_TILT : SPREAD_TILT), 0, 0);
		this.#book.quaternion.slerp(quaternion.setFromEuler(euler), pose);

		// What has to be in view: the shut book whole, or the spread, or one page of it.
		const gutter = this.#gutter(1);
		const shut = {
			x: spine / 2 + JOINT + BOARD_WIDTH / 2,
			halfWidth: BOARD_WIDTH / 2 + spine + 0.1,
			halfHeight: BOARD_HEIGHT / 2 + 0.06
		};
		const lying = this.#single
			? {
					x: gutter + (this.#focus === 'right' ? 1 : -1) * (WIDTH / 2 + 0.004),
					halfWidth: WIDTH / 2 + 0.03,
					halfHeight: HEIGHT / 2 + 0.03
				}
			: { x: 0, halfWidth: WIDTH + SQUARE + spine / 2 + 0.03, halfHeight: BOARD_HEIGHT / 2 + 0.03 };
		const wanted = {
			x: shut.x + (lying.x - shut.x) * pose,
			halfWidth: shut.halfWidth + (lying.halfWidth - shut.halfWidth) * pose,
			halfHeight: shut.halfHeight + (lying.halfHeight - shut.halfHeight) * pose
		};
		const frame = this.#frame;
		const insets = this.#margins;
		const edges = this.#options.insets ?? { top: 0, bottom: 0 };
		const ease = this.#framed ? 1 - Math.exp(-delta * 6.5) : 1;
		this.#framed = true;
		frame.x += (wanted.x - frame.x) * ease;
		frame.halfWidth += (wanted.halfWidth - frame.halfWidth) * ease;
		frame.halfHeight += (wanted.halfHeight - frame.halfHeight) * ease;
		insets.top += (edges.top - insets.top) * ease;
		insets.bottom += (edges.bottom - insets.bottom) * ease;
		const moving =
			Math.abs(wanted.x - frame.x) + Math.abs(wanted.halfWidth - frame.halfWidth) > 0.0005 ||
			Math.abs(edges.top - insets.top) + Math.abs(edges.bottom - insets.bottom) > 0.5;

		// Back far enough that every corner of that is inside the part of the
		// screen nothing else is drawn over.
		const slope = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
		const shift = wide ? (this.#options.shift ?? 0) * (1 - pose) : 0;
		const roomX = (1 - Math.abs(shift)) * 0.94;
		const roomY =
			Math.max(0.2, (height - insets.top - insets.bottom) / height) * (1 - 0.06 * (1 - pose));
		const lift = openness < 1 ? spine * (1 - pose) * 0.5 : 0;
		const centre = this.#scratch.centre
			.set(frame.x, lift, 0)
			.applyQuaternion(this.#book.quaternion);
		let distance = 0;
		for (const sx of [-1, 1]) {
			for (const sz of [-1, 1]) {
				corner
					.set(frame.x + sx * frame.halfWidth, lift, sz * frame.halfHeight)
					.applyQuaternion(this.#book.quaternion)
					.sub(centre);
				distance = Math.max(
					distance,
					Math.abs(corner.x) / (slope * this.#camera.aspect * roomX) + corner.z,
					Math.abs(corner.y) / (slope * roomY) + corner.z
				);
			}
		}

		// The pointer leans the view a little, as a head does over a book.
		const follow = 1 - Math.exp(-delta * 5);
		const swayBefore = this.#sway.x + this.#sway.y;
		this.#sway.x += (this.#pointer.x - this.#sway.x) * follow;
		this.#sway.y += (this.#pointer.y - this.#sway.y) * follow;
		const swaying = Math.abs(this.#sway.x + this.#sway.y - swayBefore) > 0.0004;
		const lean = this.#calm || this.#single ? 0 : 0.05 * pose;

		const down = ((insets.bottom - insets.top) / height) * distance * slope;
		const aside = -shift * distance * slope * this.#camera.aspect;
		this.#camera.position.set(
			centre.x + aside + this.#sway.x * lean * distance,
			centre.y - down - this.#sway.y * lean * distance * 0.6,
			centre.z + distance
		);
		this.#camera.lookAt(centre.x + aside, centre.y - down, centre.z);

		// The lamp stays over the book wherever the book is.
		this.#key.target.position.copy(centre);
		this.#key.target.updateMatrixWorld();
		return moving || swaying || (drift > 0 && openness < 1);
	}

	// ── The loop ────────────────────────────────────────────────────────────

	#invalidate() {
		if (this.#raf !== 0 || !this.#visible || document.hidden) return;
		this.#last = performance.now();
		this.#raf = requestAnimationFrame(this.#tick);
	}

	#onVisibility = () => {
		if (!document.hidden) this.#invalidate();
	};

	#onRestored = () => {
		// The graphics card forgot everything it was given.
		for (const texture of this.#pages.values()) texture.dispose();
		this.#pages.clear();
		this.#bind();
		this.#dress();
	};

	#tick = (now: number) => {
		this.#raf = 0;
		const delta = Math.min((now - this.#last) / 1000, 0.05);
		this.#last = now;
		this.#clock += delta;

		let moving = this.#advanceOpening(delta);
		moving = this.#advanceFlights(delta) || moving;
		moving = this.#advanceStacks(delta) || moving;
		this.#shape();
		moving = this.#advanceCamera(delta, this.#clock) || moving;
		this.#renderer.render(this.#scene, this.#camera);

		if (moving || this.#drag?.flight) this.#invalidate();
	};

	// ── Hands ───────────────────────────────────────────────────────────────

	/** Where a point on the screen falls on the plane the pages lie in. */
	#locate(event: PointerEvent, out: THREE.Vector3): THREE.Vector3 | null {
		const rect = this.#canvas.getBoundingClientRect();
		const { raycaster, plane, vector } = this.#scratch;
		raycaster.setFromCamera(
			new THREE.Vector2(
				((event.clientX - rect.left) / rect.width) * 2 - 1,
				-((event.clientY - rect.top) / rect.height) * 2 + 1
			),
			this.#camera
		);
		plane.setFromNormalAndCoplanarPoint(
			vector.set(0, 1, 0).applyQuaternion(this.#book.quaternion),
			this.#book.position
		);
		if (!raycaster.ray.intersectPlane(plane, out)) return null;
		return this.#book.worldToLocal(out);
	}

	/** How many pixels a page width covers where the book is now. */
	#scale(): number {
		const distance = this.#camera.position.z - this.#book.position.z;
		const slope = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
		return this.#canvas.clientHeight / (2 * distance * slope);
	}

	#onPress = (event: PointerEvent) => {
		if (this.#drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
		const local = this.#locate(event, new THREE.Vector3());
		if (!local) return;
		try {
			// So the page keeps following a finger that strays off the canvas.
			this.#canvas.setPointerCapture(event.pointerId);
		} catch {
			// Some pointers cannot be captured. The page is still turned; it is
			// only let go of sooner.
		}
		this.#drag = {
			id: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			at: performance.now(),
			local,
			flight: null,
			travel: 1,
			moved: false,
			lastX: event.clientX,
			lastAt: performance.now(),
			speed: 0
		};
	};

	#onMove = (event: PointerEvent) => {
		if (event.pointerType !== 'touch') {
			const rect = this.#canvas.getBoundingClientRect();
			this.#pointer.set(
				((event.clientX - rect.left) / rect.width) * 2 - 1,
				((event.clientY - rect.top) / rect.height) * 2 - 1
			);
			this.#invalidate();
			if (!this.#drag) this.#hover(event);
		}
		const drag = this.#drag;
		if (!drag || drag.id !== event.pointerId) return;

		const dx = event.clientX - drag.x;
		const dy = event.clientY - drag.y;
		const now = performance.now();
		if (now > drag.lastAt) {
			drag.speed = (event.clientX - drag.lastX) / (now - drag.lastAt);
			drag.lastX = event.clientX;
			drag.lastAt = now;
		}
		if (!drag.moved) {
			if (Math.hypot(dx, dy) < 9) return;
			drag.moved = true;
			// A page is turned by pulling it across, so only a sideways pull takes hold of one.
			if (!this.isOpen || Math.abs(dx) < Math.abs(dy) || this.#flights.length > 0) return;
			const direction = dx < 0 ? 1 : -1;
			if (this.#single) {
				// When the next step is only the other half of the spread, there is no leaf to hold.
				const other = direction === 1 ? this.#current.right : this.#current.left;
				if (this.#focus === (direction === 1 ? 'left' : 'right') && readable(other)) return;
			}
			const flight = this.#launch(direction, true);
			if (!flight) return;
			drag.flight = flight;
			flight.twist = THREE.MathUtils.clamp(drag.local.z / (HEIGHT / 2), -1, 1) * 0.9;
			// The point taken hold of ends up as far the other side of the gutter
			// as it began on this one.
			const reach = Math.abs(drag.local.x - this.#gutter(1));
			drag.travel = this.#single
				? this.#canvas.clientWidth * 0.85
				: Math.max(0.45, Math.min(1, reach)) * 2 * this.#scale();
			this.#options.onTurn?.();
		}
		const flight = drag.flight;
		if (!flight) return;
		// The page's edge follows the hand along the arc it travels, not the chord.
		const across = clamp01((Math.abs(dx) * Math.sign(dx) * -flight.direction) / drag.travel);
		const turned = Math.acos(1 - 2 * across) / Math.PI;
		flight.turn = flight.direction === 1 ? turned : 1 - turned;
		this.#invalidate();
	};

	#onRelease = (event: PointerEvent) => {
		const drag = this.#drag;
		if (!drag || drag.id !== event.pointerId) return;
		this.#drag = null;
		if (this.#canvas.hasPointerCapture(event.pointerId)) {
			this.#canvas.releasePointerCapture(event.pointerId);
		}

		const flight = drag.flight;
		if (flight) {
			// Let go past half way, or flicked, and the leaf goes over; otherwise it falls back.
			const done = flight.direction === 1 ? flight.turn : 1 - flight.turn;
			const flick = -drag.speed * flight.direction;
			flight.commit =
				event.type !== 'pointercancel' && (flick > 0.45 || (done > 0.5 && flick > -0.45));
			flight.held = false;
			flight.origin = flight.turn;
			flight.target = flight.commit === (flight.direction === 1) ? 1 : 0;
			flight.elapsed = 0;
			const left = Math.abs(flight.target - flight.turn);
			flight.duration = this.#calm ? 0.2 : Math.max(0.22, TURN_SECONDS * 0.75 * left);
			if (flight.commit) {
				this.source?.turned(flight.direction);
				if (this.#single) this.#focus = this.#landingFocus(flight.to, flight.direction);
			}
			this.#invalidate();
			return;
		}

		if (event.type === 'pointercancel') return;
		const dx = event.clientX - drag.x;
		if (drag.moved) {
			// A swipe that took hold of nothing still means "the next page".
			if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(event.clientY - drag.y)) {
				this.step(dx < 0 ? 1 : -1);
			}
			return;
		}
		if (performance.now() - drag.at > 600) return;
		const rect = this.#canvas.getBoundingClientRect();
		this.#tap(drag.local, (event.clientX - rect.left) / rect.width);
	};

	/** A press that did not move: `across` is how far over the screen it was, from 0 to 1. */
	#tap(local: THREE.Vector3, across: number) {
		if (this.#openness < 1) {
			if (!this.#opening) this.source?.tapped('cover');
			return;
		}
		// A press on the desk turns nothing. It is passed on, for whoever has a use for it.
		const beyond = this.#single ? WIDTH + 0.1 : WIDTH + SQUARE + this.#thickness / 2 + 0.03;
		if (Math.abs(local.z) > BOARD_HEIGHT / 2 + 0.03 || Math.abs(local.x) > beyond) {
			this.source?.tapped('outside');
			return;
		}
		// With both pages in view, each is pressed to turn it. With one, the
		// screen's right side is forward and its left edge is back.
		const forward = this.#single ? across > 0.34 : local.x > this.#gutter(1);
		const facing = this.#single ? this.#focus : forward ? 'right' : 'left';
		const face = this.#current[facing];
		if (forward && face.kind === 'invite' && this.#flights.length === 0) {
			this.source?.tapped(face);
			return;
		}
		this.step(forward ? 1 : -1);
	}

	#hover(event: PointerEvent) {
		const local = this.#locate(event, this.#scratch.corner);
		let cursor = 'default';
		if (local && Math.abs(local.z) < BOARD_HEIGHT / 2) {
			if (this.#openness < 1) {
				if (local.x > -0.1 && local.x < BOARD_WIDTH + 0.2) cursor = 'pointer';
			} else if (Math.abs(local.x) < WIDTH + 0.1) {
				const right = local.x > this.#gutter(1);
				cursor = right && this.#current.right.kind === 'invite' ? 'pointer' : 'grab';
			}
		}
		this.#canvas.style.cursor = cursor;
	}

	#onLeave = () => {
		this.#pointer.set(0, 0);
		this.#invalidate();
	};
}

/** A board: a rectangle with its two outer corners rounded, as thick as a board is. */
function boardGeometry(): THREE.BufferGeometry {
	const round = 0.04;
	const bevel = 0.004;
	const width = BOARD_WIDTH - bevel * 2;
	const half = BOARD_HEIGHT / 2 - bevel;
	const shape = new THREE.Shape();
	shape.moveTo(bevel, -half);
	shape.lineTo(bevel + width - round, -half);
	shape.quadraticCurveTo(bevel + width, -half, bevel + width, -half + round);
	shape.lineTo(bevel + width, half - round);
	shape.quadraticCurveTo(bevel + width, half, bevel + width - round, half);
	shape.lineTo(bevel, half);
	shape.closePath();

	const geometry = new THREE.ExtrudeGeometry(shape, {
		depth: BOARD - bevel * 2,
		bevelEnabled: true,
		bevelThickness: bevel,
		bevelSize: bevel,
		bevelSegments: 2,
		curveSegments: 8
	});
	// Drawn standing up; laid down, with its upper face level with the desk's zero.
	geometry.rotateX(-Math.PI / 2);
	geometry.translate(0, -(BOARD - bevel), 0);

	// The art is laid across the whole board, head at the top, whichever face it is seen on.
	const position = geometry.getAttribute('position');
	const uv = geometry.getAttribute('uv');
	for (let i = 0; i < position.count; i++) {
		uv.setXY(i, position.getX(i) / BOARD_WIDTH, 0.5 - position.getZ(i) / BOARD_HEIGHT);
	}
	return geometry;
}

/** A ribbon marker: out of the gutter at the tail, over the board's edge, and a little way down the desk. */
function ribbonGeometry(): THREE.BufferGeometry {
	const width = 0.02;
	const steps = 16;
	const tail = HEIGHT / 2;
	const position: number[] = [];
	const index: number[] = [];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const z = tail - 0.07 + t * 0.21;
		// Lying on the page, then off its edge onto the board, then off the board onto the desk.
		const offPage = smooth(clamp01((z - tail) / 0.03));
		const offBoard = smooth(clamp01((z - tail - SQUARE) / 0.03));
		const y = 0.004 * (1 - offPage) - 0.001 * offPage - (BOARD + 0.001) * offBoard;
		const x = Math.sin(t * 4.4) * 0.01 * t * t;
		position.push(x - width / 2, y, z, x + width / 2, y, z);
		if (i < steps) index.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(position), 3));
	geometry.setIndex(index);
	geometry.computeVertexNormals();
	return geometry;
}
