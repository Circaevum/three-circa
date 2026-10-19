//! Pure calculation spike: preserves Circaevum GL Y-up, clockwise phase.
//! No renderer, browser, filesystem, clock, network or user-account dependency.
#![forbid(unsafe_code)]
use std::f64::consts::TAU;
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Point3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Error {
    NonFinite,
    InvalidRadius,
    InvalidPeriod,
    InvalidScale,
    InvalidSegments,
}
fn finite(values: &[f64]) -> Result<(), Error> {
    if values.iter().all(|v| v.is_finite()) {
        Ok(())
    } else {
        Err(Error::NonFinite)
    }
}
pub fn point(
    radius: f64,
    theta_radians: f64,
    time: f64,
    height_per_time: f64,
) -> Result<Point3, Error> {
    finite(&[radius, theta_radians, time, height_per_time])?;
    if radius < 0.0 {
        return Err(Error::InvalidRadius);
    }
    let p = Point3 {
        x: theta_radians.cos() * radius,
        y: height_per_time * time,
        z: theta_radians.sin() * radius,
    };
    finite(&[p.x, p.y, p.z])?;
    Ok(p)
}
/// Unwrapped clockwise phase. Elapsed and period must use the same unit.
/// This uniform-cycle model is not an astronomical ephemeris.
pub fn phase_from_elapsed(elapsed: f64, period: f64, reference_angle: f64) -> Result<f64, Error> {
    finite(&[elapsed, period, reference_angle])?;
    if period <= 0.0 {
        return Err(Error::InvalidPeriod);
    }
    let angle = reference_angle - (elapsed / period) * TAU;
    finite(&[angle])?;
    Ok(angle)
}
/// Orbital period is measured in reference years, matching the current JS API.
/// A reference year is a caller-defined unit; no Earth duration is assumed here.
pub fn theta_from_height(
    height: f64,
    reference_height: f64,
    orbital_period: f64,
    reference_angle: f64,
    height_per_year: f64,
) -> Result<f64, Error> {
    finite(&[height, reference_height, height_per_year])?;
    if height_per_year <= 0.0 {
        return Err(Error::InvalidScale);
    }
    phase_from_elapsed(
        (height - reference_height) / height_per_year,
        orbital_period,
        reference_angle,
    )
}
#[derive(Debug, Clone, Copy)]
pub struct Helix {
    pub start_height: f64,
    pub end_height: f64,
    pub radius: f64,
    pub reference_height: f64,
    pub orbital_period: f64,
    pub reference_angle: f64,
    pub segments: usize,
    pub height_per_year: f64,
}
pub const MAX_SEGMENTS: usize = 1_000_000;
/// Inclusive endpoints: segments+1 points. Reversed and zero spans are valid.
pub fn sample_helix(h: Helix) -> Result<Vec<Point3>, Error> {
    finite(&[
        h.start_height,
        h.end_height,
        h.radius,
        h.reference_height,
        h.orbital_period,
        h.reference_angle,
        h.height_per_year,
    ])?;
    if h.segments == 0 || h.segments > MAX_SEGMENTS {
        return Err(Error::InvalidSegments);
    }
    if h.radius < 0.0 {
        return Err(Error::InvalidRadius);
    }
    if h.orbital_period <= 0.0 {
        return Err(Error::InvalidPeriod);
    }
    if h.height_per_year <= 0.0 {
        return Err(Error::InvalidScale);
    }
    let total_height = h.end_height - h.start_height;
    let orbits_in_span = (total_height / h.height_per_year) / h.orbital_period;
    let orbits_before =
        ((h.reference_height - h.start_height) / h.height_per_year) / h.orbital_period;
    let curve_start = h.reference_angle + orbits_before * TAU;
    let mut points = Vec::with_capacity(h.segments + 1);
    for i in 0..=h.segments {
        let u = i as f64 / h.segments as f64;
        points.push(point(
            h.radius,
            curve_start - u * orbits_in_span * TAU,
            h.start_height + u * total_height,
            1.0,
        )?);
    }
    Ok(points)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn example() -> Helix {
        Helix {
            start_height: 0.0,
            end_height: 100.0,
            radius: 10.0,
            reference_height: 100.0,
            orbital_period: 1.0,
            reference_angle: 0.0,
            segments: 2,
            height_per_year: 100.0,
        }
    }
    #[test]
    fn axes_and_clockwise_cycle() {
        let p = point(10.0, std::f64::consts::FRAC_PI_2, 50.0, 1.0).unwrap();
        assert!(p.x.abs() < 1e-12);
        assert_eq!(p.y, 50.0);
        assert_eq!(p.z, 10.0);
        assert_eq!(phase_from_elapsed(1.0, 1.0, 0.0).unwrap(), -TAU);
        assert_eq!(phase_from_elapsed(-1.0, 1.0, 0.0).unwrap(), TAU);
    }
    #[test]
    fn inclusive_and_reversed_spans() {
        let mut h = example();
        let p = sample_helix(h).unwrap();
        assert_eq!(p.len(), 3);
        assert_eq!(
            p.iter().map(|p| p.y).collect::<Vec<_>>(),
            vec![0.0, 50.0, 100.0]
        );
        h.start_height = 100.0;
        h.end_height = 0.0;
        assert_eq!(
            sample_helix(h)
                .unwrap()
                .iter()
                .map(|p| p.y)
                .collect::<Vec<_>>(),
            vec![100.0, 50.0, 0.0]
        );
        h.end_height = 100.0;
        assert!(sample_helix(h).unwrap().windows(2).all(|p| p[0] == p[1]));
    }
    #[test]
    fn period_and_scale_are_parameters() {
        assert_eq!(
            theta_from_height(200.0, 100.0, 2.0, 0.0, 100.0).unwrap(),
            -TAU / 2.0
        );
        assert_eq!(
            theta_from_height(300.0, 100.0, 2.0, 0.0, 200.0).unwrap(),
            -TAU / 2.0
        );
    }
    #[test]
    fn invalid_and_overflow_inputs_are_explicit() {
        let mut h = example();
        h.segments = 0;
        assert_eq!(sample_helix(h).unwrap_err(), Error::InvalidSegments);
        h.segments = MAX_SEGMENTS + 1;
        assert_eq!(sample_helix(h).unwrap_err(), Error::InvalidSegments);
        assert_eq!(phase_from_elapsed(1.0, 0.0, 0.0), Err(Error::InvalidPeriod));
        assert_eq!(point(-1.0, 0.0, 0.0, 1.0), Err(Error::InvalidRadius));
        assert_eq!(point(1.0, 0.0, f64::MAX, 2.0), Err(Error::NonFinite));
        assert_eq!(point(f64::NAN, 0.0, 0.0, 1.0), Err(Error::NonFinite));
        assert_eq!(
            theta_from_height(1.0, 0.0, 1.0, 0.0, 0.0),
            Err(Error::InvalidScale)
        );
    }
}
