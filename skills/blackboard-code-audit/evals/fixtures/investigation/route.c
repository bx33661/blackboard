#include <stdint.h>

struct Input { uint32_t frameBytes; int field; uint32_t value; int mode; };
int payload_size(uint32_t frame_bytes, uint32_t *out);
void legacy_map(int field, uint32_t value, uint32_t slots[4]);

int consume(struct Input *input, uint32_t slots[4]) {
  uint32_t payload;
  if (payload_size(input->frameBytes, &payload) != 0) return -1;
  if (input->mode == 1) {
#ifdef ENABLE_LEGACY_MAP
    if (input->field > 4) return -2;
    legacy_map(input->field, input->value, slots);
    return 0;
#else
    return 78; /* optional module unavailable */
#endif
  }
  if (input->field == -1) return 0; /* metadata handled separately */
  if (input->field < 1 || input->field > 4) return -2;
  slots[input->field - 1] = input->value;
  return 0;
}
