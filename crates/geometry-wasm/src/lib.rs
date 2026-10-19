#[unsafe(no_mangle)]
pub extern "C" fn distance2d(ax: f64, ay: f64, bx: f64, by: f64) -> f64 {
    (bx - ax).hypot(by - ay)
}

#[unsafe(no_mangle)]
pub extern "C" fn midpoint_x2d(ax: f64, bx: f64) -> f64 {
    ax / 2.0 + bx / 2.0
}

#[unsafe(no_mangle)]
pub extern "C" fn midpoint_y2d(ay: f64, by: f64) -> f64 {
    ay / 2.0 + by / 2.0
}

#[cfg(test)]
mod tests {
    use super::{distance2d, midpoint_x2d, midpoint_y2d};

    #[test]
    fn geometry_fixture_matches_the_javascript_round_trip() {
        assert_eq!(distance2d(1.0, 2.0, 4.0, 6.0), 5.0);
        assert_eq!(midpoint_x2d(1.0, 4.0), 2.5);
        assert_eq!(midpoint_y2d(2.0, 6.0), 4.0);
    }

    #[test]
    fn midpoint_does_not_overflow_for_large_finite_coordinates() {
        assert_eq!(midpoint_x2d(f64::MAX, f64::MAX), f64::MAX);
        assert_eq!(midpoint_y2d(f64::MAX, f64::MAX), f64::MAX);
    }
}
use cavalier_contours::polyline::{PlineOffsetOptions, PlineSource, PlineSourceMut, Polyline};

#[unsafe(no_mangle)]
pub extern "C" fn geometry_alloc(length: usize) -> *mut f64 {
    Box::into_raw(vec![0.0; length].into_boxed_slice()).cast::<f64>()
}

/// The caller owns the exact allocation returned by geometry_alloc or polyline_offset.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn geometry_free(pointer: *mut f64, length: usize) {
    if !pointer.is_null() {
        unsafe {
            drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(
                pointer, length,
            )))
        };
    }
}

/// Packed [x,y,bulge] input; packed [length,count,closed,n,x,y,bulge,...] output.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn polyline_offset(
    pointer: *const f64,
    length: usize,
    closed: bool,
    distance: f64,
) -> *mut f64 {
    let input = unsafe { std::slice::from_raw_parts(pointer, length) };
    let mut source = if closed {
        Polyline::new_closed()
    } else {
        Polyline::new()
    };
    let mut output = vec![2.0, 0.0];
    if length >= 6
        && length % 3 == 0
        && distance.is_finite()
        && input.iter().all(|value| value.is_finite())
    {
        for vertex in input.chunks_exact(3) {
            source.add(vertex[0], vertex[1], vertex[2]);
        }
        let options = PlineOffsetOptions {
            handle_self_intersects: true,
            pos_equal_eps: 1e-8,
            offset_dist_eps: 1e-7,
            ..Default::default()
        };
        let results = source.parallel_offset_opt(distance, &options);
        output[1] = results.len() as f64;
        for result in results {
            output.push(if result.is_closed() { 1.0 } else { 0.0 });
            output.push(result.vertex_count() as f64);
            for vertex in result.iter_vertexes() {
                output.extend([vertex.x, vertex.y, vertex.bulge]);
            }
        }
        output[0] = output.len() as f64;
    }
    Box::into_raw(output.into_boxed_slice()).cast::<f64>()
}
