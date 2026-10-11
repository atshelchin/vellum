/**
 * The bindings a diary can wear. The contract keeps a diary's binding as a
 * number and knows nothing more about it: this list is what the numbers mean,
 * so its order must never change. A number past the end wraps round.
 */
export interface CoverStyle {
	name: string;
	leather: string;
	/** The stamping on the front board, as the stops of a gradient across it. */
	foil: string[];
	/** Whether the stamping is metal leaf. If not, it is ink, and takes the light like the leather does. */
	metal: boolean;
	roughness: number;
	/** The paper pasted inside the boards, and the small figure printed on it. */
	endpaper: string;
	endpaperMark: string;
	ribbon: string;
}

const GOLD = ['#f8e7a8', '#d8ad4f', '#a67a26', '#efd58a', '#c59a3c'];
const SILVER = ['#f4f6f8', '#b9c0c8', '#7d858e', '#e1e5ea', '#a3abb4'];
const COPPER = ['#fbd3b4', '#d98b5c', '#9c5630', '#f0b48c', '#c57848'];

export const COVERS: CoverStyle[] = [
	{
		name: 'Oxblood',
		leather: '#6a1d1f',
		foil: GOLD,
		metal: true,
		roughness: 0.56,
		endpaper: '#e6d6b4',
		endpaperMark: 'rgb(106 29 31 / 0.2)',
		ribbon: '#c8a04a'
	},
	{
		name: 'Midnight',
		leather: '#1a2748',
		foil: GOLD,
		metal: true,
		roughness: 0.54,
		endpaper: '#d9d4c2',
		endpaperMark: 'rgb(26 39 72 / 0.2)',
		ribbon: '#b33a32'
	},
	{
		name: 'Forest',
		leather: '#1d3d30',
		foil: GOLD,
		metal: true,
		roughness: 0.58,
		endpaper: '#e2dcc0',
		endpaperMark: 'rgb(29 61 48 / 0.2)',
		ribbon: '#c8a04a'
	},
	{
		name: 'Saddle',
		leather: '#8a5527',
		foil: GOLD,
		metal: true,
		roughness: 0.62,
		endpaper: '#efe2c4',
		endpaperMark: 'rgb(110 66 28 / 0.22)',
		ribbon: '#3d5a46'
	},
	{
		name: 'Onyx',
		leather: '#1c1c1f',
		foil: SILVER,
		metal: true,
		roughness: 0.5,
		endpaper: '#d5d2cc',
		endpaperMark: 'rgb(28 28 31 / 0.18)',
		ribbon: '#b33a32'
	},
	{
		name: 'Plum',
		leather: '#47213f',
		foil: COPPER,
		metal: true,
		roughness: 0.56,
		endpaper: '#e7d8cf',
		endpaperMark: 'rgb(71 33 63 / 0.2)',
		ribbon: '#d98b5c'
	},
	{
		name: 'Petrol',
		leather: '#12434b',
		foil: GOLD,
		metal: true,
		roughness: 0.56,
		endpaper: '#dfdcc6',
		endpaperMark: 'rgb(18 67 75 / 0.2)',
		ribbon: '#c8a04a'
	},
	{
		name: 'Linen',
		leather: '#cdbf9e',
		foil: ['#4f321a', '#3a2412', '#5a3a20'],
		metal: false,
		roughness: 0.86,
		endpaper: '#f1e7cf',
		endpaperMark: 'rgb(90 58 32 / 0.16)',
		ribbon: '#8a2f2a'
	}
];
