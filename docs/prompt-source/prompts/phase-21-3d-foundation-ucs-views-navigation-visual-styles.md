PHASE 21 — 3D foundation: UCS, views, navigation, visual styles
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–20 are done.

Goal: work in 3D space with AutoCAD's coordinate systems, views, and display styles.

Build:
- UCS with every option (origin, Face, NAmed, OBject, Previous, View, World, X/Y/Z rotation, ZAxis, 3-point), UCSMAN, the 3D UCS icon and UCSICON properties, UCS icon grips, UCSFOLLOW, UCSVP, UCSORTHO, PLAN, dynamic UCS (F6, Ctrl+D). Correct OCS handling (the arbitrary axis algorithm) for every planar entity, plus ELEVATION and THICKNESS.
- Views and navigation: VPOINT, DDVPOINT, DVIEW (every option), 3DORBIT, 3DFORBIT, 3DCORBIT, 3DDISTANCE, 3DSWIVEL, 3DZOOM, 3DPAN, 3DWALK/3DFLY, the ViewCube (faces, edges, corners, Home, rotate arrows, compass, UCS menu, perspective/parallel switch), NAVBAR, preset views (Top, Bottom, Left, Right, Front, Back, SW/SE/NE/NW Isometric), PERSPECTIVE, CAMERA.
- In-canvas viewport controls [-][평면도][2D 와이어프레임] with their menus.
- Visual styles: 2D 와이어프레임, 와이어프레임, 숨김, 사실적, 개념, 음영처리, 모서리로 음영처리, 회색 음영, 스케치, X-ray; the VISUALSTYLES manager with all face, edge, environment, and lighting settings; VSCURRENT, SHADEMODE, HIDE.
- 3D display pipeline: depth, edges and silhouettes, hidden-line removal, default lighting, backgrounds.
- Legacy 3D entities: 3DFACE (invisible edges), 3DPOLY, PFACE, 3DMESH, RULESURF, TABSURF, REVSURF, EDGESURF (SURFTAB1, SURFTAB2).
- 3D input and editing: x,y,z, spherical and cylindrical coordinates, 3D object snaps (3DOSMODE, F4), 3DMOVE, 3DROTATE, 3DSCALE gizmos (DEFAULTGIZMO), 3DMIRROR, 3DARRAY, 3DALIGN.

Acceptance:
- [ ] UCS 3-point on a tilted plane, then a circle, gives a circle whose DXF extrusion vector and OCS center match AutoCAD's.
- [ ] Clicking a ViewCube corner gives the matching isometric view; Shift+middle drag orbits.
- [ ] Hidden and Conceptual styles show 3DFACE and mesh models correctly.
