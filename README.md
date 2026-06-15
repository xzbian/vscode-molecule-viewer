# Structure Viewer

Interactive 3D visualization of molecular structures with trajectory playback. Open molecular structure files directly in VS Code and explore them with an integrated WebGL viewer.

## Features

✨ **Supported Formats**
- **XYZ** (.xyz) - Multi-frame trajectories with play/pause and frame slider
- **Extended XYZ** (.extxyz) - With lattice information for periodic structures
- **POSCAR/CONTCAR** - VASP format with automatic fractional-to-Cartesian conversion
- **LAMMPS Data** (.lmp, .data) - With interactive atom type mapping

📦 **Structure Visualization**
- Ball-and-stick atomic representation
- **Automatic unit cell detection** - Shows periodic box wireframe for POSCAR, extXYZ, and LAMMPS files
- **Atom wrapping** - Atoms automatically wrapped into unit cell for periodic systems
- Interactive 3D rotation, zoom, pan
- Real-time atom coordinate display on hover

🎬 **Trajectory Playback**
- Play/pause controls for multi-frame files
- Frame slider for manual navigation
- Frame counter showing current/total frames

🔧 **Smart Element Detection**
- For LAMMPS files: Auto-detects elements from atomic masses in Masses section
- User-configurable mapping for atom types → chemical elements (C, O, N, H, etc.)
 

## Usage

1. Open a structure file (.xyz, .extxyz, POSCAR, .lmp, .data)
2. Right-click in the editor and select **"Structure Viewer: Open Current File"**
   - Or use the icon in the editor title bar
3. The structure will render in a new Webview panel
4. Interact with the 3D model:
   - **Drag mouse** - Rotate view
   - **Scroll** - Zoom in/out
   - **Ctrl+Drag** - Pan camera

## File Format Details

### XYZ Format
```
3
Comment line (optional)
C  0.0  0.0  0.0
H  1.0  0.0  0.0
H  0.0  1.0  0.0
```

### Extended XYZ (.extxyz)
Same as XYZ but with lattice info in comment:
```
Lattice="ax ay az bx by bz cx cy cz"
```

### POSCAR (VASP)
Standard VASP POSCAR format with lattice vectors and atomic coordinates.

### LAMMPS Data (.lmp, .data)
When opening a LAMMPS file, a dialog appears to map atom types to elements:
- If Masses section exists: auto-detects elements by atomic mass
- If no Masses section: manually enter element symbols

## Keyboard Shortcuts

- **Drag** - Rotate
- **Scroll** - Zoom
- **Ctrl + Drag** - Pan
- **Double-click** - Reset view (autoView)

## Examples

Try these example files included in the repository:
```bash
examples/
├── example.xyz          # Water molecule trajectory
├── POSCAR              # CaCO₃ structure with unit cell
├── conf.lmp            # LAMMPS structure
└── example.extxyz      # Extended XYZ with lattice
```

## Requirements

- VS Code 1.85.0 or later
- WebGL-capable graphics card (for 3D rendering)

## Known Limitations

- Only ball-and-stick representation (stick bonds are atomic vdW + bonded pairs)
- No support for velocities or forces
- Large structures (>10,000 atoms) may be slow

## Troubleshooting

**"Unsupported file" error**
- Ensure file has correct extension (.xyz, .extxyz, .lmp, .data, or POSCAR)
- Check file is not corrupted

**Atoms not visible**
- Try double-clicking in the viewport to reset camera (autoView)
- Check atom coordinates are reasonable (not excessively large)

**Periodic box not showing**
- Box appears for POSCAR, extXYZ (with Lattice=...), and LAMMPS files
- XYZ files without lattice won't show a box

## Development

Clone and build locally:
```bash
git clone https://github.com/xb7635/vscode-structure-viewer.git
cd vscode-structure-viewer
npm install
npm run compile

# Debug in VS Code
# Press F5 to launch Extension Development Host
```

## Contributing

Contributions are welcome! Open issues for bugs or feature requests.

## License

MIT

## Credits

Built with:
- [NGL Viewer](https://nglviewer.org/) - 3D molecular visualization
- [VS Code Extension API](https://code.visualstudio.com/api)
