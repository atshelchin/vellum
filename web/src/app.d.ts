// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		// interface Error {}
		// interface Locals {}
		interface PageData {
			/** What a link to the page says about itself when it is shared. */
			card?: { title: string; description: string };
		}
		interface PageState {
			/** Set on arriving at a diary straight from opening it. */
			fresh?: boolean;
		}
	}
}

export {};
