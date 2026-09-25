"""gravity.integration — "Połącz każdy system" 6-second seamless loop.

Blender 5 / Cycles scene, built and animated entirely from this script so the
shot is reproducible: every moving part is a pure function of time t in
[0, 6), and every function is periodic on 6.0 s, so frame 180 == frame 0.

Run (bpy as a Python module):
  python gi_scene.py --out DIR --res 1920x1080 --spp 10 --frames 0-179
  python gi_scene.py --out DIR --res 640x360 --spp 16 --times 1.2,2.0
"""
import argparse, json, math, os, sys, time

import bpy
import numpy as np
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

# ---------------------------------------------------------------- timeline
LOOP = 6.0
FPS = 30
NFR = int(LOOP * FPS)

# ---------------------------------------------------------------- layout
D_WELL, A_WELL = 2.25, 1.45         # Plummer-profile gravity well
R_HUB = 1.0
HUB_SINK = 0.04                     # the hub presses slightly into the satin
R_RIM = 5.3                         # ring the systems sit on
R_SYS = 0.46
R_SAT, SAT_ORBIT = 0.27, 2.45       # two green satellites rolling in the well
SYSTEMS = [("ERP", 120.0), ("CRM", 60.0), ("WMS", 0.0),
           ("API", 300.0), ("SQL", 240.0), ("EDI", 180.0)]
IDX = {n: i for i, (n, _) in enumerate(SYSTEMS)}

# ---------------------------------------------------------------- choreography
BEATS = [0.9, 2.9, 4.9]             # hub receives -> merges -> sends
ROUTES = [(["ERP", "WMS"], ["CRM", "SQL"]),
          (["CRM", "API"], ["EDI", "WMS"]),
          (["SQL", "EDI"], ["ERP", "API"])]
T_IN, T_OUT, OUT_DELAY = 0.9, 0.9, 0.08
TRAIL = 0.34                        # streak length, in seconds of travel
SWIRL = math.radians(96)            # how far a pulse winds round the well
EASE_POW = 2.3                      # gravity: accelerate in, decelerate out
R_START = R_RIM - R_SYS - 0.10      # pulses leave from the sphere's inner side
R_END = R_HUB + 0.06                # ...and dive under the hub's flank
RIPPLE_V = (R_RIM - R_HUB) / (T_OUT + OUT_DELAY)   # wave lands with the pulses
RIP_A, RIP_DECAY, RIP_L, RIP_S = 0.085, 1.25, 0.95, 0.55
AMB_A, AMB_L, AMB_T = 0.012, 1.35, 3.0             # ambient outward drift (T | LOOP)

GREEN = (0.0203, 0.8228, 0.2918)    # #27EA93 in linear sRGB
NAVY = (0.0242, 0.0273, 0.0595)     # #2b2e45
SATIN = (0.80, 0.81, 0.88)


def smoothstep(e0, e1, x):
    x = np.clip((np.asarray(x, dtype=np.float64) - e0) / (e1 - e0), 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def event_taus(t0, t):
    """Time since an event that repeats every LOOP, for the copies that can
    still be ringing at t. Summing over them is what makes the loop seamless."""
    return [t - (t0 + n * LOOP) for n in (-1, 0, 1)]


# ---------------------------------------------------------------- surface
def well(r):
    return -D_WELL / np.sqrt(1.0 + (r / A_WELL) ** 2)


def ripple(r, t):
    r = np.asarray(r, dtype=np.float64)
    h = np.zeros_like(r)
    for tb in BEATS:
        for tau in event_taus(tb, t):
            if tau <= 0.0 or tau > 3.5:
                continue
            rho = R_HUB + RIPPLE_V * tau
            env = RIP_A * math.exp(-tau / RIP_DECAY) * min(1.0, tau / 0.10)
            x = r - rho
            h += env * np.sin(2 * np.pi * x / RIP_L) * np.exp(-(x / RIP_S) ** 2) \
                 / np.sqrt(np.maximum(r, R_HUB) / R_HUB)
    h += AMB_A * np.sin(2 * np.pi * (r / AMB_L - t / AMB_T)) \
         * smoothstep(1.3, 3.2, r) * np.exp(-r / 14.0)
    return h


def wave_glow(r, t):
    """Emission riding the leading crest of each beat's wavefront."""
    r = np.asarray(r, dtype=np.float64)
    g = np.zeros_like(r)
    for tb in BEATS:
        for tau in event_taus(tb, t):
            if tau <= 0.0 or tau > 2.2:
                continue
            rho = R_HUB + RIPPLE_V * tau
            env = math.exp(-tau / 0.42) * min(1.0, tau / 0.06)
            g += env * np.exp(-((r - rho - 0.10) / 0.085) ** 2)
    return g


def surface_z(r, t):
    return well(r) + ripple(r, t)


def surface_slope(r, t, dr=1e-3):
    return (surface_z(r + dr, t) - surface_z(r - dr, t)) / (2 * dr)


def resting_z(r, t, rad, sink=0.0):
    g = surface_slope(np.array([r]), t)[0]
    return surface_z(np.array([r]), t)[0] + rad * math.sqrt(1.0 + g * g) - sink


# ---------------------------------------------------------------- pulses
def ease_in(x):
    return np.clip(x, 0, 1) ** EASE_POW


def ease_out(x):
    return 1.0 - (1.0 - np.clip(x, 0, 1)) ** EASE_POW


def pulse_events():
    ev = []
    for b, tb in enumerate(BEATS):
        ins, outs = ROUTES[b]
        for n in ins:
            ev.append(dict(kind="in", sys=n, t0=tb - T_IN, dur=T_IN, beat=b))
        for n in outs:
            ev.append(dict(kind="out", sys=n, t0=tb + OUT_DELAY, dur=T_OUT, beat=b))
    return ev


EVENTS = pulse_events()


def path_polar(ev, u):
    th0 = math.radians(SYSTEMS[IDX[ev["sys"]]][1])
    u = np.asarray(u, dtype=np.float64)
    if ev["kind"] == "in":          # rim -> hub, winding tighter as it falls
        r = R_START + (R_END - R_START) * u
        th = th0 + SWIRL * u ** 1.5
    else:                           # hub -> rim, unwinding as it climbs out
        r = R_END + (R_START - R_END) * u
        th = th0 - SWIRL * (1.0 - u) ** 1.5
    return r, th


def pulse_state(ev, t):
    """(u_tail, u_head) along the path, or None when not visible."""
    for tau in event_taus(ev["t0"], t):
        x = tau / ev["dur"]
        span = TRAIL / ev["dur"]
        if 0.0 <= x <= 1.0 + span:
            e = ease_in if ev["kind"] == "in" else ease_out
            head = float(e(min(x, 1.0)))
            tail = float(e(np.clip(x - span, 0.0, 1.0)))
            if head - tail > 1e-4:
                return tail, head
    return None


# ---------------------------------------------------------------- reactions
def flash(tau, attack=0.05, decay=0.5):
    if tau < 0:
        return 0.0
    if tau < attack:
        return tau / attack
    return math.exp(-(tau - attack) / decay)


def hub_state(t):
    pulse, scale = 0.0, 1.0
    for tb in BEATS:
        for tau in event_taus(tb, t):
            pulse += flash(tau, 0.05, 0.42)
            scale -= 0.016 * math.exp(-((tau + 0.11) / 0.065) ** 2)      # anticipation
            if tau > 0:
                scale += 0.042 * math.exp(-4.6 * tau) * math.sin(2 * math.pi * tau / 0.52)
    return min(pulse, 1.4), scale


def system_state(name, t):
    glow, scale = 0.0, 1.0
    for ev in EVENTS:
        if ev["sys"] != name:
            continue
        if ev["kind"] == "out":     # receives: lights up green, pops
            for tau in event_taus(ev["t0"] + ev["dur"], t):
                glow += flash(tau, 0.06, 0.55)
                if tau > 0:
                    scale += 0.075 * math.exp(-5.0 * tau) * math.sin(2 * math.pi * tau / 0.46)
        else:                       # sends: a small recoil as the pulse leaves
            for tau in event_taus(ev["t0"], t):
                scale -= 0.045 * math.exp(-((tau - 0.03) / 0.09) ** 2)
                glow += 0.35 * flash(tau, 0.03, 0.25)
    return min(glow, 1.2), scale


def satellite_angles(t):
    base = math.radians(-3.0) + math.pi * t / LOOP     # half-turn per loop; phase
    # chosen by sweep: -3 deg keeps every pulse >= 0.28 clear of the twins
    return [base, base + math.pi]                      # identical twins swap


# ---------------------------------------------------------------- camera
CAM_TARGET = Vector((0.0, 0.4, -1.05))
CAM_DIST, CAM_ELEV, CAM_AZ = 20.6, math.radians(35.0), math.radians(-90.0)
CAM_DRIFT = math.radians(2.6)


def camera_pose(t):
    az = CAM_AZ + CAM_DRIFT * math.sin(2 * math.pi * t / LOOP)
    d = CAM_DIST * (1.0 + 0.012 * math.sin(2 * math.pi * t / LOOP + 1.1))
    pos = CAM_TARGET + Vector((d * math.cos(CAM_ELEV) * math.cos(az),
                               d * math.cos(CAM_ELEV) * math.sin(az),
                               d * math.sin(CAM_ELEV)))
    return pos


# ================================================================ scene build
def node(nt, kind, loc=(0, 0), **inputs):
    n = nt.nodes.new(kind)
    n.location = loc
    for k, v in inputs.items():
        n.inputs[k].default_value = v
    return n


def principled(name, base, rough, coat=0.0, coat_rough=0.05, sheen=0.0, spec=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*base, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Coat Roughness"].default_value = coat_rough
    b.inputs["Sheen Weight"].default_value = sheen
    b.inputs["Sheen Roughness"].default_value = 0.45
    b.inputs["Specular IOR Level"].default_value = spec
    return m, b


def sock(sockets, ident):
    """Blender 5's Mix node has one "A"/"B"/"Result" per data type; name lookup
    returns the (disabled) float socket. Resolve by identifier instead."""
    for s_ in sockets:
        if s_.identifier == ident:
            return s_
    raise KeyError(ident)


def obj_attr(nt, prop, loc):
    a = nt.nodes.new("ShaderNodeAttribute")
    a.attribute_type = "OBJECT"
    a.attribute_name = prop
    a.location = loc
    return a


def build_materials(P):
    mats = {}
    # satin surface with an emissive wavefront (per-vertex attribute "wave")
    m, b = principled("satin", SATIN, P["satin_rough"], sheen=P["satin_sheen"], spec=0.35)
    nt = m.node_tree
    a = nt.nodes.new("ShaderNodeAttribute"); a.attribute_type = "GEOMETRY"; a.attribute_name = "wave"
    mul = node(nt, "ShaderNodeMath", (-300, -300)); mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = P["wave_emit"]
    nt.links.new(a.outputs["Fac"], mul.inputs[0])
    b.inputs["Emission Color"].default_value = (*GREEN, 1)
    nt.links.new(mul.outputs[0], b.inputs["Emission Strength"])
    mats["satin"] = m

    # hub: glossy brand green, inner flash on each beat
    m, b = principled("hub", P["hub_base"], 0.32, coat=1.0, coat_rough=0.03, spec=0.5)
    nt = m.node_tree
    a = obj_attr(nt, '["pulse"]', (-500, -300))
    mul = node(nt, "ShaderNodeMath", (-300, -300)); mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = P["hub_emit"]
    nt.links.new(a.outputs["Fac"], mul.inputs[0])
    b.inputs["Emission Color"].default_value = (*GREEN, 1)
    nt.links.new(mul.outputs[0], b.inputs["Emission Strength"])
    mats["hub"] = m

    # systems: glossy navy that turns green when data lands
    m, b = principled("system", NAVY, 0.28, coat=1.0, coat_rough=0.04, spec=0.5)
    nt = m.node_tree
    a = obj_attr(nt, '["glow"]', (-700, 0))
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.location = (-400, 150)
    sock(mix.inputs, "A_Color").default_value = (*NAVY, 1)
    sock(mix.inputs, "B_Color").default_value = (*GREEN, 1)
    clamp = node(nt, "ShaderNodeMath", (-550, 150)); clamp.operation = "MINIMUM"
    clamp.inputs[1].default_value = 1.0
    nt.links.new(a.outputs["Fac"], clamp.inputs[0])
    # green is ~15x brighter than navy: ease the tint so a fading glow doesn't
    # leave the sphere teal for a second after the flash has visibly ended
    sq = node(nt, "ShaderNodeMath", (-480, 150)); sq.operation = "POWER"
    sq.inputs[1].default_value = 3.0
    nt.links.new(clamp.outputs[0], sq.inputs[0])
    nt.links.new(sq.outputs[0], sock(mix.inputs, "Factor_Float"))
    nt.links.new(sock(mix.outputs, "Result_Color"), b.inputs["Base Color"])
    mul = node(nt, "ShaderNodeMath", (-400, -300)); mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = P["sys_emit"]
    nt.links.new(sq.outputs[0], mul.inputs[0])      # same eased curve as the tint
    b.inputs["Emission Color"].default_value = (*GREEN, 1)
    nt.links.new(mul.outputs[0], b.inputs["Emission Strength"])
    mats["system"] = m

    m, b = principled("satellite", (0.035, 0.55, 0.20), 0.3, coat=1.0, coat_rough=0.03)
    mats["satellite"] = m

    # pulses: emission fading to fully transparent along the tail
    m = bpy.data.materials.new("pulse"); m.use_nodes = True
    nt = m.node_tree
    for n_ in list(nt.nodes):
        nt.nodes.remove(n_)
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (400, 0)
    a = nt.nodes.new("ShaderNodeAttribute"); a.attribute_type = "GEOMETRY"; a.attribute_name = "glow"
    a.location = (-600, 0)
    em = nt.nodes.new("ShaderNodeEmission"); em.location = (0, -100)
    core = nt.nodes.new("ShaderNodeMix"); core.data_type = "RGBA"; core.location = (-250, -50)
    sock(core.inputs, "A_Color").default_value = (*GREEN, 1)
    sock(core.inputs, "B_Color").default_value = (0.55, 1.0, 0.75, 1)   # hot core
    pw = node(nt, "ShaderNodeMath", (-400, -150)); pw.operation = "POWER"; pw.inputs[1].default_value = 3.0
    nt.links.new(a.outputs["Fac"], pw.inputs[0])
    nt.links.new(pw.outputs[0], sock(core.inputs, "Factor_Float"))
    nt.links.new(sock(core.outputs, "Result_Color"), em.inputs["Color"])
    mul = node(nt, "ShaderNodeMath", (-250, -250)); mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = P["pulse_emit"]
    nt.links.new(a.outputs["Fac"], mul.inputs[0])
    nt.links.new(mul.outputs[0], em.inputs["Strength"])
    tr = nt.nodes.new("ShaderNodeBsdfTransparent"); tr.location = (0, 100)
    ms = nt.nodes.new("ShaderNodeMixShader"); ms.location = (200, 0)
    cl = node(nt, "ShaderNodeMath", (-250, 150)); cl.operation = "MINIMUM"; cl.inputs[1].default_value = 1.0
    nt.links.new(a.outputs["Fac"], cl.inputs[0])
    nt.links.new(cl.outputs[0], ms.inputs["Fac"])
    nt.links.new(tr.outputs[0], ms.inputs[1])
    nt.links.new(em.outputs[0], ms.inputs[2])
    nt.links.new(ms.outputs[0], out.inputs["Surface"])
    mats["pulse"] = m
    return mats


def radial_mesh(name, radii, nt_):
    th = np.linspace(0, 2 * np.pi, nt_, endpoint=False)
    R, T = np.meshgrid(radii, th, indexing="ij")
    co = np.zeros((1 + R.size, 3))
    co[1:, 0] = (R * np.cos(T)).ravel()
    co[1:, 1] = (R * np.sin(T)).ravel()
    faces = [(0, 1 + j, 1 + (j + 1) % nt_) for j in range(nt_)]
    nr = len(radii)
    i = np.arange(nr - 1)[:, None]
    j = np.arange(nt_)[None, :]
    a = 1 + i * nt_ + j
    b_ = 1 + i * nt_ + (j + 1) % nt_
    c = 1 + (i + 1) * nt_ + (j + 1) % nt_
    d = 1 + (i + 1) * nt_ + j
    quads = np.stack([a, b_, c, d], -1).reshape(-1, 4)
    faces += [tuple(q) for q in quads.tolist()]
    me = bpy.data.meshes.new(name)
    me.from_pydata(co.tolist(), [], faces)
    me.update()
    me.shade_smooth()
    return me, co


def uv_sphere(name, radius, mat, seg=128, rings=64):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=radius)
    o = bpy.context.object
    o.name = name
    o.data.shade_smooth()
    o.data.materials.append(mat)
    return o


class Shot:
    def __init__(self, P):
        self.P = P
        bpy.ops.wm.read_factory_settings(use_empty=True)
        sc = self.sc = bpy.context.scene
        sc.render.engine = "CYCLES"
        cy = sc.cycles
        cy.device = "CPU"
        cy.samples = P["spp"]
        cy.use_adaptive_sampling = True
        cy.adaptive_threshold = P["adaptive"]
        cy.adaptive_min_samples = max(4, P["spp"] // 2)
        cy.use_denoising = True
        cy.denoiser = "OPENIMAGEDENOISE"
        cy.denoising_input_passes = "RGB_ALBEDO_NORMAL"
        cy.denoising_prefilter = "FAST"     # ACCURATE cost 17 s/frame, no visible gain
        cy.seed = 7
        cy.use_animated_seed = False        # correlated noise = no denoiser boil
        cy.max_bounces, cy.diffuse_bounces, cy.glossy_bounces = 5, 2, 3
        cy.transmission_bounces, cy.volume_bounces, cy.transparent_max_bounces = 0, 0, 4
        cy.caustics_reflective = cy.caustics_refractive = False
        cy.sample_clamp_indirect = 8.0
        cy.blur_glossy = 0.8
        sc.render.use_persistent_data = True
        sc.render.film_transparent = False
        sc.render.filter_size = 1.5
        sc.view_settings.view_transform = "Standard"
        sc.render.image_settings.file_format = "OPEN_EXR"
        sc.render.image_settings.color_depth = "16"
        sc.render.image_settings.exr_codec = "ZIP"
        sc.render.resolution_percentage = 100

        self.mats = build_materials(P)

        # satin: dense where things happen, sparse toward the horizon
        radii = np.concatenate([np.linspace(0.02, 1.2, 40)[:-1],
                                np.linspace(1.2, 8.0, 230)[:-1],
                                np.geomspace(8.0, 90.0, 90)])
        self.surf_me, self.surf_co = radial_mesh("satin", radii, P["surf_seg"])
        self.surf_r = np.hypot(self.surf_co[:, 0], self.surf_co[:, 1])
        self.surf = bpy.data.objects.new("satin", self.surf_me)
        sc.collection.objects.link(self.surf)
        self.surf_me.materials.append(self.mats["satin"])
        self.surf_me.attributes.new("wave", "FLOAT", "POINT")

        self.hub = uv_sphere("hub", R_HUB, self.mats["hub"])
        self.hub["pulse"] = 0.0
        self.systems = {}
        for n, _ in SYSTEMS:
            o = uv_sphere("sys_" + n, R_SYS, self.mats["system"], 96, 48)
            o["glow"] = 0.0
            self.systems[n] = o
        self.sats = [uv_sphere(f"sat{k}", R_SAT, self.mats["satellite"], 64, 32) for k in range(2)]

        self.pulse_obj = bpy.data.objects.new("pulses", bpy.data.meshes.new("pulses"))
        sc.collection.objects.link(self.pulse_obj)

        self._lights()
        cam_data = bpy.data.cameras.new("cam")
        cam_data.lens = P["lens"]
        cam_data.sensor_width = 36
        cam_data.dof.use_dof = P["fstop"] > 0
        cam_data.dof.aperture_fstop = max(P["fstop"], 0.01)
        cam_data.dof.aperture_blades = 0
        self.cam = bpy.data.objects.new("cam", cam_data)
        sc.collection.objects.link(self.cam)
        sc.camera = self.cam

    def _lights(self):
        P, sc = self.P, self.sc
        w = bpy.data.worlds.new("studio"); sc.world = w; w.use_nodes = True
        nt = w.node_tree
        bg = nt.nodes["Background"]
        # soft studio dome: bright zenith, lavender horizon (matches #f3f4fb)
        tc = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.0
        ramp.color_ramp.elements[0].color = (0.78, 0.79, 0.88, 1)
        ramp.color_ramp.elements[1].position = 0.85
        ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1)
        nt.links.new(tc.outputs["Generated"], sep.inputs[0])
        nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = P["world"]

        def area(name, loc, size, energy, target=(0, 0, -1), shape="DISK", size_y=None):
            L = bpy.data.lights.new(name, "AREA")
            L.shape = shape
            L.size = size
            if size_y:
                L.size_y = size_y
            L.energy = energy
            o = bpy.data.objects.new(name, L)
            o.location = loc
            d = Vector(target) - Vector(loc)
            o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
            sc.collection.objects.link(o)
            return o

        area("key", P["key_loc"], P["key_size"], P["key_energy"])
        area("fill", P["fill_loc"], 9.0, P["fill_energy"])
        area("top", (1.0, 3.0, 14.0), 16.0, P["top_energy"])
        area("rim", (4.0, 16.0, 5.0), 10.0, P["rim_energy"], shape="RECTANGLE", size_y=2.0)

    # ------------------------------------------------------------ per frame
    def update(self, t):
        P = self.P
        # satin
        z = surface_z(self.surf_r, t)
        co = self.surf_co.copy()
        co[:, 2] = z
        self.surf_me.vertices.foreach_set("co", co.astype(np.float32).ravel())
        self.surf_me.attributes["wave"].data.foreach_set(
            "value", wave_glow(self.surf_r, t).astype(np.float32))
        self.surf_me.update()

        # hub
        pulse, s = hub_state(t)
        self.hub["pulse"] = pulse
        self.hub.scale = (s, s, s)
        self.hub.location = (0, 0, resting_z(0.0, t, R_HUB * s, HUB_SINK))

        # systems ride the ripples
        for n, ang in SYSTEMS:
            o = self.systems[n]
            glow, s = system_state(n, t)
            o["glow"] = glow
            o.scale = (s, s, s)
            a = math.radians(ang)
            o.location = (R_RIM * math.cos(a), R_RIM * math.sin(a),
                          resting_z(R_RIM, t, R_SYS * s, 0.02))

        for o, a in zip(self.sats, satellite_angles(t)):
            o.location = (SAT_ORBIT * math.cos(a), SAT_ORBIT * math.sin(a),
                          resting_z(SAT_ORBIT, t, R_SAT, 0.01))

        self._pulses(t)

        pos = camera_pose(t)
        self.cam.location = pos
        d = CAM_TARGET - pos
        self.cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        self.cam.data.dof.focus_distance = (Vector(self.hub.location) - pos).length - 0.2
        bpy.context.view_layer.update()

    def _pulses(self, t):
        P = self.P
        verts, faces, glow = [], [], []
        ring = 10
        ang = np.linspace(0, 2 * np.pi, ring, endpoint=False)
        for ev in EVENTS:
            st = pulse_state(ev, t)
            if st is None:
                continue
            u0, u1 = st
            k = 72
            v = np.linspace(0.0, 1.0, k)                       # 0 tail .. 1 head
            u = u0 + (u1 - u0) * v
            r, th = path_polar(ev, u)
            rad = P["pulse_r"] * (0.18 + 0.82 * v ** 0.55)
            x, y = r * np.cos(th), r * np.sin(th)
            zc = surface_z(r, t) + rad + 0.012
            pts = np.stack([x, y, zc], -1)
            tang = np.gradient(pts, axis=0)
            tang /= np.linalg.norm(tang, axis=1, keepdims=True) + 1e-9
            up = np.array([0, 0, 1.0])
            nrm = np.cross(tang, up); nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9
            bin_ = np.cross(nrm, tang)
            base = len(verts)
            for i in range(k):
                for c, s_ in zip(np.cos(ang), np.sin(ang)):
                    p = pts[i] + rad[i] * (c * nrm[i] + s_ * bin_[i])
                    verts.append(tuple(p))
                    glow.append(float(v[i] ** 1.7))
            for i in range(k - 1):
                for j in range(ring):
                    a = base + i * ring + j
                    b_ = base + i * ring + (j + 1) % ring
                    faces.append((a, b_, b_ + ring, a + ring))
            # head: a small hot bead
            hc = pts[-1]
            hb = len(verts)
            nlat, nlon = 8, 12
            hr = P["pulse_r"] * 1.55
            verts.append(tuple(hc + np.array([0, 0, hr]))); glow.append(1.6)
            for i in range(1, nlat):
                phi = math.pi * i / nlat
                for j in range(nlon):
                    lam = 2 * math.pi * j / nlon
                    verts.append(tuple(hc + hr * np.array([math.sin(phi) * math.cos(lam),
                                                           math.sin(phi) * math.sin(lam),
                                                           math.cos(phi)])))
                    glow.append(1.6)
            verts.append(tuple(hc - np.array([0, 0, hr]))); glow.append(1.6)
            top, bot = hb, len(verts) - 1
            for j in range(nlon):
                faces.append((top, hb + 1 + j, hb + 1 + (j + 1) % nlon))
            for i in range(nlat - 2):
                for j in range(nlon):
                    a = hb + 1 + i * nlon + j
                    b_ = hb + 1 + i * nlon + (j + 1) % nlon
                    faces.append((a, a + nlon, b_ + nlon, b_))
            last = hb + 1 + (nlat - 2) * nlon
            for j in range(nlon):
                faces.append((last + j, bot, last + (j + 1) % nlon))
        me = bpy.data.meshes.new("pulses")
        if verts:
            me.from_pydata(verts, [], faces)
            me.update()
            me.shade_smooth()
            at = me.attributes.new("glow", "FLOAT", "POINT")
            at.data.foreach_set("value", np.array(glow, np.float32))
        me.materials.append(self.mats["pulse"])
        old = self.pulse_obj.data
        self.pulse_obj.data = me
        bpy.data.meshes.remove(old)

    # ------------------------------------------------------------ overlays
    def screen_data(self, t):
        """Where each system (and the hub) lands on screen, for the 2D chips."""
        sc, cam = self.sc, self.cam
        W, H = sc.render.resolution_x, sc.render.resolution_y
        cm = cam.matrix_world
        up, right = cm.to_3x3() @ Vector((0, 1, 0)), cm.to_3x3() @ Vector((1, 0, 0))
        out = {"t": t, "systems": {}}

        def proj(p):
            v = world_to_camera_view(sc, cam, p)
            return v.x * W, (1 - v.y) * H, v.z

        f = cam.data.lens / cam.data.sensor_width * W       # focal length, px
        fd = cam.data.dof.focus_distance
        N = cam.data.dof.aperture_fstop
        f_m = cam.data.lens / 1000.0

        def coc_px(depth):
            if not cam.data.dof.use_dof:
                return 0.0
            c_m = (f_m * f_m / (N * (fd - f_m))) * abs(depth - fd) / depth
            return c_m / (cam.data.sensor_width / 1000.0) * W

        for n, _ in SYSTEMS:
            o = self.systems[n]
            c = Vector(o.location)
            rad = R_SYS * o.scale[0]
            x, y, z = proj(c)
            xt, yt, _ = proj(c + up * rad)
            xr, _, _ = proj(c + right * rad)
            glow, _ = system_state(n, t)
            out["systems"][n] = dict(x=x, y=y, top=yt, rpx=abs(xr - x), depth=z,
                                     coc=coc_px(z), glow=glow, scale=o.scale[0])
        c = Vector(self.hub.location)
        x, y, z = proj(c)
        _, yb, _ = proj(c - up * R_HUB)
        out["hub"] = dict(x=x, y=y, bottom=yb, depth=z, pulse=hub_state(t)[0])
        return out


DEFAULTS = dict(
    spp=6, adaptive=0.02, lens=45.0, fstop=0.16, surf_seg=512,
    satin_rough=0.42, satin_sheen=0.15, world=0.25,
    key_loc=(-19.8, 12.6, 9.0), key_size=10.8, key_energy=11000.0,
    fill_loc=(14.0, -8.0, 6.0), fill_energy=700.0,
    top_energy=150.0, rim_energy=300.0,
    wave_emit=0.35, hub_emit=0.75, sys_emit=0.75, pulse_emit=16.0, pulse_r=0.06,
    hub_base=(0.008, 0.36, 0.13),
)


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--res", default="640x360")
    ap.add_argument("--spp", type=int, default=None)
    ap.add_argument("--frames", default=None, help="a-b inclusive, frame indices")
    ap.add_argument("--times", default=None, help="comma list of seconds")
    ap.add_argument("--set", action="append", default=[], help="param=value overrides")
    a = ap.parse_args(argv)
    P = dict(DEFAULTS)
    if a.spp:
        P["spp"] = a.spp
    for kv in a.set:
        k, v = kv.split("=", 1)
        P[k] = eval(v)
    g = globals()
    for k in ("D_WELL", "A_WELL", "CAM_DIST", "RIP_A", "AMB_A"):
        if k.lower() in P:
            g[k] = P[k.lower()]
    if "cam_elev" in P:
        g["CAM_ELEV"] = math.radians(P["cam_elev"])
    os.makedirs(a.out, exist_ok=True)
    shot = Shot(P)
    W, H = map(int, a.res.split("x"))
    shot.sc.render.resolution_x, shot.sc.render.resolution_y = W, H
    jobs = []
    if a.frames:
        f0, f1 = map(int, a.frames.split("-"))
        jobs = [(f"f{i:04d}", i / FPS) for i in range(f0, f1 + 1)]
    if a.times:
        jobs += [(f"t{float(x):.3f}".replace(".", "_"), float(x)) for x in a.times.split(",")]
    meta_path = os.path.join(a.out, "screen.json")
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    for name, t in jobs:
        path = os.path.join(a.out, name + ".exr")
        shot.update(t)
        meta[name] = shot.screen_data(t)
        if os.path.exists(path):
            continue
        shot.sc.render.filepath = path
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"FRAME {name} t={t:.3f} {W}x{H} {time.time() - t0:.1f}s", flush=True)
        json.dump(meta, open(meta_path, "w"))
    json.dump(meta, open(meta_path, "w"))
    json.dump(P, open(os.path.join(a.out, "params.json"), "w"), indent=1)


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:])
