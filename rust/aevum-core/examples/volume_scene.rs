//! Volume adapter. Samples several uniform cycles and emits schema 1 primitives.
//! The library stays a calculation. This file only places.
use circaevum_aevum_core::{sample_helix, Helix};
use std::f64::consts::TAU;

fn main() {
    println!("{}", scene());
}

struct Prim {
    id: String,
    kind: &'static str,
    at: [f64; 3],
    to: Option<[f64; 3]>,
    radius: f64,
    color: [f64; 4],
    name: String,
    info: String,
}

fn scene() -> String {
    let cycles = [
        (6.0, 0.0, "inner", [0.910, 0.725, 0.286, 1.0]),
        (12.0, TAU / 3.0, "middle", [0.573, 0.392, 0.859, 1.0]),
        (18.0, 2.0 * TAU / 3.0, "outer", [0.910, 0.929, 0.949, 1.0]),
    ];
    let mut raw = vec![Prim {
        id: "time".into(),
        kind: "segment",
        at: [0.0, 0.0, 0.0],
        to: Some([0.0, 100.0, 0.0]),
        radius: 0.25,
        color: [0.910, 0.929, 0.949, 1.0],
        name: String::new(),
        info: "Y is height. Uniform cycle, not an ephemeris.".into(),
    }];
    for (radius, angle, name, color) in cycles {
        let points = sample_helix(Helix {
            start_height: 0.0,
            end_height: 100.0,
            radius,
            reference_height: 100.0,
            orbital_period: 1.0,
            reference_angle: angle,
            segments: 36,
            height_per_year: 100.0,
        })
        .expect("helix");
        if let Some(first) = points.first() {
            raw.push(Prim {
                id: format!("{name}-start"),
                kind: "sphere",
                at: [first.x, first.y, first.z],
                to: None,
                radius: 1.2,
                color,
                name: name.into(),
                info: format!("helix · radius {radius} · one orbit · height 0–100"),
            });
        }
        for (i, pair) in points.windows(2).enumerate() {
            raw.push(Prim {
                id: format!("{name}-{i}"),
                kind: "segment",
                at: [pair[0].x, pair[0].y, pair[0].z],
                to: Some([pair[1].x, pair[1].y, pair[1].z]),
                radius: 0.28,
                color,
                name: String::new(),
                info: String::new(),
            });
        }
    }
    fit(&mut raw);
    let mut body = String::from("{\n  \"schema\": 1,\n  \"source\": \"aevum\",\n  \"primitives\": [\n");
    for (i, primitive) in raw.iter().enumerate() {
        if i > 0 {
            body.push_str(",\n");
        }
        body.push_str(&format!(
            "    {{\"id\":{id},\"kind\":{kind},\"at\":{at},\"to\":{to},\"radius\":{radius:.5},\"color\":[{c0:.3},{c1:.3},{c2:.3},{c3:.3}],\"name\":{name},\"info\":{info}}}",
            id = json_str(&primitive.id),
            kind = json_str(primitive.kind),
            at = triple(primitive.at),
            to = primitive.to.map(triple).unwrap_or("null".into()),
            radius = primitive.radius,
            c0 = primitive.color[0],
            c1 = primitive.color[1],
            c2 = primitive.color[2],
            c3 = primitive.color[3],
            name = json_str(&primitive.name),
            info = json_str(&primitive.info),
        ));
    }
    body.push_str("\n  ]\n}\n");
    body
}

fn fit(primitives: &mut [Prim]) {
    let mut min = [f64::MAX; 3];
    let mut max = [f64::MIN; 3];
    for primitive in primitives.iter() {
        for point in std::iter::once(primitive.at).chain(primitive.to) {
            for k in 0..3 {
                min[k] = min[k].min(point[k]);
                max[k] = max[k].max(point[k]);
            }
        }
    }
    let center = [(min[0] + max[0]) / 2.0, (min[1] + max[1]) / 2.0, (min[2] + max[2]) / 2.0];
    let extent = (0..3).map(|k| max[k] - min[k]).fold(0.001, f64::max);
    let scale = 0.82 / extent;
    for primitive in primitives {
        for k in 0..3 {
            primitive.at[k] = (primitive.at[k] - center[k]) * scale;
        }
        if let Some(to) = primitive.to.as_mut() {
            for k in 0..3 {
                to[k] = (to[k] - center[k]) * scale;
            }
        }
        let floor = if primitive.kind == "segment" { 0.0035 } else { 0.012 };
        primitive.radius = (primitive.radius * scale).max(floor);
    }
}

fn triple(v: [f64; 3]) -> String {
    format!("[{:.5},{:.5},{:.5}]", v[0], v[1], v[2])
}

fn json_str(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}
