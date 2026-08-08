import type { Ref } from 'vue';
import { onMounted, watchEffect } from 'vue';

export function bindNativeProps(
  element: Ref<HTMLElement | null>,
  props: () => Record<string, unknown>,
): void {
  const apply = () => {
    const target = element.value as (HTMLElement & Record<string, unknown>) | null;
    if (!target) return;
    for (const [key, value] of Object.entries(props())) target[key] = value;
  };
  onMounted(apply);
  watchEffect(apply);
}
