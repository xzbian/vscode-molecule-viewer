(function () {
  const statusEl = document.getElementById("status");
  const controlsEl = document.getElementById("controls");
  const playBtn = document.getElementById("playBtn");
  const frameSlider = document.getElementById("frameSlider");
  const frameLabel = document.getElementById("frameLabel");

  function waitForNGL(timeout = 5000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (typeof window.NGL !== "undefined") {
          resolve(window.NGL);
        } else if (Date.now() - start > timeout) {
          reject(new Error("NGL library failed to load"));
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  let stage;
  let frames = [];
  let currentFrame = 0;
  let isPlaying = false;

  function setStatus(msg) {
    statusEl.textContent = msg;
  }

  function wrapToUnitCell(atoms, cellVectors) {
    if (!cellVectors) return atoms;
    const inv = matrixInverse3x3(cellVectors);

    return atoms.map((atom) => {
      // Lattice vectors are stored as rows, so Cartesian coordinates are
      // multiplied by the inverse on the right.
      const frac = [
        atom.x * inv[0][0] + atom.y * inv[1][0] + atom.z * inv[2][0],
        atom.x * inv[0][1] + atom.y * inv[1][1] + atom.z * inv[2][1],
        atom.x * inv[0][2] + atom.y * inv[1][2] + atom.z * inv[2][2]
      ];

      frac[0] = frac[0] - Math.floor(frac[0]);
      frac[1] = frac[1] - Math.floor(frac[1]);
      frac[2] = frac[2] - Math.floor(frac[2]);

      return { ...atom, ...fractionalToCartesian(frac, cellVectors) };
    });
  }

  function fractionalToCartesian(frac, cellVectors) {
    return {
      x: frac[0] * cellVectors[0][0] + frac[1] * cellVectors[1][0] + frac[2] * cellVectors[2][0],
      y: frac[0] * cellVectors[0][1] + frac[1] * cellVectors[1][1] + frac[2] * cellVectors[2][1],
      z: frac[0] * cellVectors[0][2] + frac[1] * cellVectors[1][2] + frac[2] * cellVectors[2][2]
    };
  }

  function matrixInverse3x3(m) {
    const [a, b, c] = m;
    const det = 
      a[0] * (b[1] * c[2] - b[2] * c[1]) -
      a[1] * (b[0] * c[2] - b[2] * c[0]) +
      a[2] * (b[0] * c[1] - b[1] * c[0]);

    if (Math.abs(det) < 1e-10) throw new Error("Singular matrix");

    return [
      [
        (b[1] * c[2] - b[2] * c[1]) / det,
        (a[2] * c[1] - a[1] * c[2]) / det,
        (a[1] * b[2] - a[2] * b[1]) / det
      ],
      [
        (b[2] * c[0] - b[0] * c[2]) / det,
        (a[0] * c[2] - a[2] * c[0]) / det,
        (a[2] * b[0] - a[0] * b[2]) / det
      ],
      [
        (b[0] * c[1] - b[1] * c[0]) / det,
        (a[1] * c[0] - a[0] * c[1]) / det,
        (a[0] * b[1] - a[1] * b[0]) / det
      ]
    ];
  }

  function drawUnitCell(NGL, stage, cellVectors) {
    if (!cellVectors) return;

    try {
      const [a, b, c] = cellVectors;
      const origin = [0, 0, 0];
      
      const shape = new NGL.Shape("unitcell", { disableImpostor: true });
      const color = [0.2, 0.2, 0.2]; // dark gray for visibility
      const radius = 0.1;
      
      // Define 8 vertices of the unit cell
      const v0 = origin;
      const v1 = [a[0], a[1], a[2]];
      const v2 = [b[0], b[1], b[2]];
      const v3 = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
      const v4 = [c[0], c[1], c[2]];
      const v5 = [a[0] + c[0], a[1] + c[1], a[2] + c[2]];
      const v6 = [b[0] + c[0], b[1] + c[1], b[2] + c[2]];
      const v7 = [a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]];
      
      // Draw 12 edges of the unit cell as cylinders
      const edges = [
        // Bottom face (z=0)
        [v0, v1], [v1, v3], [v3, v2], [v2, v0],
        // Top face (z=c)
        [v4, v5], [v5, v7], [v7, v6], [v6, v4],
        // Vertical edges
        [v0, v4], [v1, v5], [v2, v6], [v3, v7]
      ];
      
      edges.forEach(([start, end]) => {
        shape.addCylinder(start, end, color, radius);
      });
      
      const shapeComp = stage.addComponentFromObject(shape);
      shapeComp.addRepresentation("buffer");
      
      console.log("Unit cell wireframe drawn");
    } catch (err) {
      console.error("Error drawing unit cell:", err);
    }
  }

  function parseXyzOrExtxyz(text) {
    const lines = text.split(/\r?\n/);
    const parsedFrames = [];
    let i = 0;

    while (i < lines.length) {
      const atomCountLine = lines[i]?.trim();
      if (!atomCountLine || !Number.isFinite(Number.parseInt(atomCountLine, 10))) {
        i += 1;
        continue;
      }

      const atomCount = Number.parseInt(atomCountLine, 10);
      if (atomCount <= 0 || i + 2 + atomCount > lines.length) {
        break;
      }

      const comment = lines[i + 1] ?? "";
      const atomLines = lines.slice(i + 2, i + 2 + atomCount);
      const atoms = atomLines.map((line) => {
        const parts = line.trim().split(/\s+/);
        return {
          element: parts[0],
          x: Number.parseFloat(parts[1]),
          y: Number.parseFloat(parts[2]),
          z: Number.parseFloat(parts[3])
        };
      });

      let cellVectors = null;

      if (comment.includes("Lattice=")) {
        const match = comment.match(/Lattice="([^"]+)"/);
        if (match) {
          const vals = match[1].split(/\s+/).map(Number);
          if (vals.length === 9) {
            cellVectors = [
              [vals[0], vals[1], vals[2]],
              [vals[3], vals[4], vals[5]],
              [vals[6], vals[7], vals[8]]
            ];
            const wrappedAtoms = wrapToUnitCell(atoms, cellVectors);
            parsedFrames.push({ atoms: wrappedAtoms, cell: cellVectors });
          }
        }
      }

      if (!cellVectors) {
        parsedFrames.push({ atoms, cell: null });
      }

      i += 2 + atomCount;
    }

    if (parsedFrames.length === 0) {
      throw new Error("No valid XYZ frames found.");
    }

    return parsedFrames;
  }

  function parseVaspHeader(lines) {
    if (lines.length < 7) {
      throw new Error("Invalid VASP structure header.");
    }

    const scaleValue = Number.parseFloat(lines[1]);
    if (!Number.isFinite(scaleValue) || scaleValue === 0) {
      throw new Error("Invalid VASP lattice scaling factor.");
    }

    const rawCell = [];
    for (let i = 0; i < 3; i += 1) {
      const parts = lines[2 + i].split(/\s+/).map(Number);
      if (parts.length < 3 || parts.slice(0, 3).some((value) => !Number.isFinite(value))) {
        throw new Error("Invalid VASP lattice vector.");
      }
      rawCell.push(parts.slice(0, 3));
    }

    let scale = scaleValue;
    if (scaleValue < 0) {
      const volume = Math.abs(
        rawCell[0][0] * (rawCell[1][1] * rawCell[2][2] - rawCell[1][2] * rawCell[2][1]) -
        rawCell[0][1] * (rawCell[1][0] * rawCell[2][2] - rawCell[1][2] * rawCell[2][0]) +
        rawCell[0][2] * (rawCell[1][0] * rawCell[2][1] - rawCell[1][1] * rawCell[2][0])
      );
      if (volume === 0) {
        throw new Error("VASP lattice vectors have zero volume.");
      }
      scale = Math.cbrt(Math.abs(scaleValue) / volume);
    }

    const cellVectors = rawCell.map((vector) => vector.map((value) => value * scale));
    const elementOrCountLine = lines[5].split(/\s+/);
    const hasElements = elementOrCountLine.some((value) => !Number.isInteger(Number.parseFloat(value)));
    const elementNames = hasElements
      ? elementOrCountLine
      : elementOrCountLine.map((_, index) => `Element${index + 1}`);
    const countLineIndex = hasElements ? 6 : 5;
    const elementCounts = lines[countLineIndex].split(/\s+/).map((value) => Number.parseInt(value, 10));
    if (
      elementCounts.length === 0 ||
      elementCounts.some((count) => !Number.isInteger(count) || count < 0) ||
      elementCounts.length !== elementNames.length
    ) {
      throw new Error("Invalid VASP element counts.");
    }

    return {
      cellVectors,
      coordinateScale: scale,
      elementNames,
      elementCounts,
      coordinateStart: countLineIndex + 1
    };
  }

  function parseVaspAtoms(lines, startIndex, header, isDirect) {
    let lineIdx = startIndex;
    if (lines[lineIdx]?.toUpperCase().startsWith("S")) {
      lineIdx += 1;
      if (lines[lineIdx]?.toUpperCase().startsWith("D") ||
          lines[lineIdx]?.toUpperCase().startsWith("C")) {
        lineIdx += 1;
      }
    }

    const atoms = [];
    header.elementNames.forEach((element, elementIndex) => {
      for (let atomIndex = 0; atomIndex < header.elementCounts[elementIndex]; atomIndex += 1) {
        const parts = lines[lineIdx]?.split(/\s+/).map(Number);
        if (!parts || parts.length < 3 || parts.slice(0, 3).some((value) => !Number.isFinite(value))) {
          throw new Error("Invalid VASP coordinate line.");
        }
        const coordinates = isDirect
          ? fractionalToCartesian(parts, header.cellVectors)
          : {
            x: parts[0] * header.coordinateScale,
            y: parts[1] * header.coordinateScale,
            z: parts[2] * header.coordinateScale
          };
        atoms.push({ element, ...coordinates });
        lineIdx += 1;
      }
    });
    return atoms;
  }

  function parsePoscar(text) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    const header = parseVaspHeader(lines);
    const coordinateIndex = lines[header.coordinateStart]?.toUpperCase().startsWith("S")
      ? header.coordinateStart + 1
      : header.coordinateStart;
    const coordinateLine = lines[coordinateIndex]?.toUpperCase() ?? "";
    if (coordinateLine.startsWith("DIRECT CONFIGURATION")) {
      const parsedFrames = [];
      let lineIdx = header.coordinateStart;
      while (lineIdx < lines.length) {
        if (!lines[lineIdx].toUpperCase().startsWith("DIRECT CONFIGURATION")) {
          lineIdx += 1;
          continue;
        }
        lineIdx += 1;
        const atoms = parseVaspAtoms(lines, lineIdx, header, true);
        parsedFrames.push({ atoms: wrapToUnitCell(atoms, header.cellVectors), cell: header.cellVectors });
        lineIdx += header.elementCounts.reduce((sum, count) => sum + count, 0);
      }
      if (parsedFrames.length === 0) {
        throw new Error("No VASP trajectory frames found.");
      }
      return parsedFrames;
    }

    if (!coordinateLine.startsWith("D") && !coordinateLine.startsWith("C") && !coordinateLine.startsWith("K")) {
      throw new Error("Invalid POSCAR format.");
    }
    const atoms = parseVaspAtoms(
      lines,
      header.coordinateStart,
      header,
      coordinateLine.startsWith("D")
    );
    if (atoms.length === 0) throw new Error("No atoms found in POSCAR.");
    return [{ atoms: wrapToUnitCell(atoms, header.cellVectors), cell: header.cellVectors }];
  }

  const ATOMIC_MASSES = {
    H: 1.008, C: 12.011, N: 14.007, O: 15.999, P: 30.974, S: 32.065,
    Ca: 40.078, O: 15.999, Cl: 35.453, Na: 22.990, K: 39.098,
    Fe: 55.845, Mg: 24.305, Al: 26.982, Si: 28.086, F: 18.998
  };

  function matchMassToElement(mass) {
    let closest = null;
    let minDiff = Infinity;
    for (const [elem, atomicMass] of Object.entries(ATOMIC_MASSES)) {
      const diff = Math.abs(mass - atomicMass);
      if (diff < minDiff) {
        minDiff = diff;
        closest = elem;
      }
    }
    return minDiff < 2 ? closest : null;
  }

  function parseLammps(text) {
    const lines = text.split(/\r?\n/);
    let atomCount = 0;
    let atomTypes = 0;
    const bounds = { x: [0, 0], y: [0, 0], z: [0, 0], xy: 0, xz: 0, yz: 0 };
    const atoms = [];
    const masses = {}; // type -> mass
    let inAtomsSection = false;
    let inMassesSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.includes("atoms")) {
        atomCount = Number.parseInt(line.split(/\s+/)[0], 10);
      } else if (line.includes("atom types")) {
        atomTypes = Number.parseInt(line.split(/\s+/)[0], 10);
      } else if (line.includes("xlo xhi")) {
        const parts = line.split(/\s+/).map(Number);
        bounds.x = [parts[0], parts[1]];
      } else if (line.includes("ylo yhi")) {
        const parts = line.split(/\s+/).map(Number);
        bounds.y = [parts[0], parts[1]];
      } else if (line.includes("zlo zhi")) {
        const parts = line.split(/\s+/).map(Number);
        bounds.z = [parts[0], parts[1]];
      } else if (line.includes("xy xz yz")) {
        const parts = line.split(/\s+/).map(Number);
        bounds.xy = parts[0];
        bounds.xz = parts[1];
        bounds.yz = parts[2];
      } else if (line === "Masses" || line.startsWith("Masses ")) {
        inMassesSection = true;
        i += 1;
        continue;
      } else if (line === "Atoms" || line.startsWith("Atoms #")) {
        inMassesSection = false;
        inAtomsSection = true;
        i += 1;
        continue;
      }

      if (inMassesSection && line && !line.startsWith("Masses")) {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const type = Number.parseInt(parts[0], 10);
          const mass = Number.parseFloat(parts[1]);
          masses[type] = mass;
        }
      }

      if (inAtomsSection && line && !line.startsWith("Atoms")) {
        const parts = line.split(/\s+/);
        if (parts.length >= 5) {
          const id = Number.parseInt(parts[0], 10);
          const type = Number.parseInt(parts[1], 10);
          const x = Number.parseFloat(parts[2]);
          const y = Number.parseFloat(parts[3]);
          const z = Number.parseFloat(parts[4]);

          atoms.push({
            type,
            x,
            y,
            z
          });
        }

        if (atoms.length === atomCount) {
          break;
        }
      }
    }

    if (atoms.length === 0) {
      throw new Error("No atoms found in LAMMPS file.");
    }

    const cellVectors = [
      [bounds.x[1] - bounds.x[0], bounds.xy, bounds.xz],
      [0, bounds.y[1] - bounds.y[0], bounds.yz],
      [0, 0, bounds.z[1] - bounds.z[0]]
    ];

    return {
      atoms,
      cell: cellVectors,
      masses,
      atomTypes
    };
  }

  function applyTypeMapping(parsedLammps, typeToElement) {
    const { atoms, cell, masses } = parsedLammps;
    const mappedAtoms = atoms.map((atom) => ({
      element: typeToElement[atom.type] || `Type${atom.type}`,
      x: atom.x,
      y: atom.y,
      z: atom.z
    }));
    const wrappedAtoms = wrapToUnitCell(mappedAtoms, cell);
    return [{ atoms: wrappedAtoms, cell }];
  }

  function detectElementsFromMasses(masses) {
    const typeToElement = {};
    for (const [type, mass] of Object.entries(masses)) {
      const elem = matchMassToElement(mass);
      typeToElement[type] = elem || `Type${type}`;
    }
    return typeToElement;
  }

  function atomsToPdb(atoms) {
    const lines = ["HEADER    Converted from Structure File"];
    let serial = 1;
    atoms.forEach((atom) => {
      const record = "ATOM  ";
      const ser = String(serial).padStart(5);
      const name = String(atom.element).padEnd(4);
      const res = "ALA";
      const chain = "A";
      const resSeq = "   1";
      const x = String(atom.x.toFixed(3)).padStart(8);
      const y = String(atom.y.toFixed(3)).padStart(8);
      const z = String(atom.z.toFixed(3)).padStart(8);
      const occ = "  1.00";
      const bfac = "  0.00";
      const element = String(atom.element).padEnd(2);
      
      const line = 
        record +
        ser +
        " " +
        name +
        " " +
        res +
        " " +
        chain +
        resSeq +
        "   " +
        x +
        y +
        z +
        occ +
        bfac +
        "           " +
        element;
      
      lines.push(line);
      serial += 1;
    });
    lines.push("END");
    return lines.join("\n");
  }

  async function renderFrame(frameIndex) {
    if (frameIndex < 0 || frameIndex >= frames.length) {
      return;
    }

    const NGL = await waitForNGL();
    if (!stage) {
      stage = new NGL.Stage("viewport", { backgroundColor: "white" });
      window.addEventListener("resize", () => stage && stage.handleResize());
    }

    stage.removeAllComponents();

    const frameData = frames[frameIndex];
    const atoms = frameData.atoms || frameData;
    const cellVectors = frameData.cell;

    const pdb = atomsToPdb(atoms);
    const blob = new Blob([pdb], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const component = await stage.loadFile(url, { ext: "pdb" });
    URL.revokeObjectURL(url);
    component.addRepresentation("ball+stick");
    component.autoView();

    if (cellVectors) {
      drawUnitCell(NGL, stage, cellVectors);
    }

    currentFrame = frameIndex;
    frameSlider.value = frameIndex;
    frameLabel.textContent = `${frameIndex + 1}/${frames.length}`;
    setStatus(`Frame ${frameIndex + 1}/${frames.length}${cellVectors ? " (periodic)" : ""}`);
  }

  async function playTrajectory() {
    if (!frames.length) return;
    isPlaying = !isPlaying;
    playBtn.textContent = isPlaying ? "Pause" : "Play";

    if (isPlaying) {
      const playFrame = async () => {
        if (!isPlaying) return;
        await renderFrame(currentFrame);
        currentFrame = (currentFrame + 1) % frames.length;
        setTimeout(playFrame, 100);
      };
      playFrame();
    }
  }

  frameSlider.addEventListener("input", (e) => {
    const index = Number.parseInt(e.target.value, 10);
    isPlaying = false;
    playBtn.textContent = "Play";
    renderFrame(index);
  });

  playBtn.addEventListener("click", playTrajectory);

  let pendingLammpsData = null;

  function showMappingDialog(masses, atomTypes) {
    const dialog = document.getElementById("mappingDialog");
    const overlay = document.getElementById("mappingOverlay");
    const inputs = document.getElementById("mappingInputs");

    inputs.innerHTML = "";
    for (let type = 1; type <= atomTypes; type++) {
      const mass = masses[type] || "unknown";
      const row = document.createElement("div");
      row.className = "mapping-row";
      row.innerHTML = `
        <label>Type ${type}:</label>
        <input type="text" id="type-${type}" placeholder="e.g., C, O, N, H" value="Type${type}" />
        <span style="font-size: 11px; color: #666;">${mass !== "unknown" ? `(mass: ${mass.toFixed(2)})` : ""}</span>
      `;
      inputs.appendChild(row);
    }

    dialog.style.display = "block";
    overlay.style.display = "block";

    document.getElementById("mappingSubmit").onclick = () => {
      const mapping = {};
      for (let type = 1; type <= atomTypes; type++) {
        const elem = document.getElementById(`type-${type}`).value.trim() || `Type${type}`;
        mapping[type] = elem;
      }
      dialog.style.display = "none";
      overlay.style.display = "none";
      proceedWithLammps(pendingLammpsData, mapping);
    };
  }

  function proceedWithLammps(parsedLammps, typeToElement) {
    try {
      const rendered = applyTypeMapping(parsedLammps, typeToElement);
      frames = rendered;
      controlsEl.style.display = frames.length > 1 ? "block" : "none";
      frameSlider.max = frames.length - 1;
      renderFrame(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg}`);
    }
  }

  window.addEventListener("message", async (event) => {
    const message = event.data;
    if (!message || message.type !== "loadStructure") {
      return;
    }

    try {
      let parsed = [];
      if (message.format === "xyz" || message.format === "extxyz") {
        parsed = parseXyzOrExtxyz(String(message.text ?? ""));
      } else if (message.format === "poscar") {
        parsed = parsePoscar(String(message.text ?? ""));
      } else if (message.format === "lammps") {
        const parsedLammps = parseLammps(String(message.text ?? ""));
        const masses = parsedLammps.masses;
        const atomTypes = parsedLammps.atomTypes;

        if (Object.keys(masses).length > 0) {
          const detected = detectElementsFromMasses(masses);
          pendingLammpsData = parsedLammps;
          showMappingDialog(masses, atomTypes);
        } else {
          pendingLammpsData = parsedLammps;
          showMappingDialog({}, atomTypes);
        }
        return;
      } else {
        setStatus(`Unknown format: ${String(message.format)}`);
        return;
      }

      frames = parsed;
      controlsEl.style.display = frames.length > 1 ? "block" : "none";
      frameSlider.max = frames.length - 1;
      await renderFrame(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg}`);
    }
  });
})();
