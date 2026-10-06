import math
from typing import Dict, Any, List


def calculate_slice_angles(slice_count: int) -> List[Dict[str, Any]]:
    """
    Yuvarlak pasta için dilimlerin başlangıç, bitiş ve orta açılarını döner.
    """
    slice_count = max(1, min(24, slice_count))
    step = 360.0 / slice_count
    slices = []

    for i in range(slice_count):
        start_angle = i * step
        end_angle = (i + 1) * step
        mid_angle = start_angle + (step / 2.0)
        
        # Dilim merkez noktasının normalize koordinatı (merkez: 0.5, 0.5)
        # Yarıçap yaklaşık 0.28 (pasta içi)
        rad = math.radians(mid_angle - 90) # -90 tepe noktasından başlatır
        cx = 0.5 + 0.28 * math.cos(rad)
        cy = 0.5 + 0.28 * math.sin(rad)

        slices.append({
            "index": i,
            "start_angle": start_angle,
            "end_angle": end_angle,
            "mid_angle": mid_angle,
            "default_x": round(cx, 4),
            "default_y": round(cy, 4)
        })

    return slices
