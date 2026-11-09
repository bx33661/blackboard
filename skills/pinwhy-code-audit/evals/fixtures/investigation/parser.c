#include <stdint.h>
#include <assert.h>

int payload_size(uint32_t frame_bytes, uint32_t *out) {
  if (frame_bytes < 16u || frame_bytes > 528u) return -1;
  *out = frame_bytes - 16u;
  return 0;
}

void legacy_map(int field, uint32_t value, uint32_t slots[4]) {
  int index = field - 1;
  assert(index >= 0 && index < 4);
  slots[index] = value;
}
