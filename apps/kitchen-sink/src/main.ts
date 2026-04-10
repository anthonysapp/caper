import type { KitchenSinkApplication } from '@/KitchenSinkApplication';
import { Sidebar } from '@/ui/sidebar';

export default async function main(app: KitchenSinkApplication) {
  new Sidebar(app).mount();
}
