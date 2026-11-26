/** A build-time switch. The public demo runs without an API or database. */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === '1';
