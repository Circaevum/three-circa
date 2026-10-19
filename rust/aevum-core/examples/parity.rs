use circaevum_aevum_core::{point, sample_helix, theta_from_height, Helix};
fn main() {
    let v: Vec<f64> = std::env::args()
        .skip(1)
        .map(|s| s.parse().unwrap())
        .collect();
    assert_eq!(v.len(), 8);
    let h = Helix {
        start_height: v[0],
        end_height: v[1],
        radius: v[2],
        reference_height: v[3],
        orbital_period: v[4],
        reference_angle: v[5],
        segments: v[6] as usize,
        height_per_year: v[7],
    };
    let p = point(h.radius, h.reference_angle, h.reference_height, 1.0).unwrap();
    let theta = theta_from_height(
        h.end_height,
        h.reference_height,
        h.orbital_period,
        h.reference_angle,
        h.height_per_year,
    )
    .unwrap();
    let flat: Vec<f64> = sample_helix(h)
        .unwrap()
        .into_iter()
        .flat_map(|p| [p.x, p.y, p.z])
        .collect();
    println!(
        "{{\"point\":{:?},\"theta\":{:?},\"points\":{:?}}}",
        [p.x, p.y, p.z],
        theta,
        flat
    );
}
