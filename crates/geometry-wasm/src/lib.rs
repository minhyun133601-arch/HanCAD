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
