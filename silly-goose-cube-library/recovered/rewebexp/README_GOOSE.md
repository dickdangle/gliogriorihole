# 🪿 Goose of the Day 3D Print Server

Procedurally generates unique 3D printable geese with UUIDs following LENR open source methodologies.

## Quick Start

Open your terminal in this directory and run:

```bash
python goose_server.py
```

Then open your browser to: `http://localhost:8080`

## Features

- 🪿 **Procedurally generated geese** - Each unique, identified by UUID
- 📐 **STL CAD files** - Ready for 3D printing
- 🔧 **Deterministic** - Same UUID = same goose every time
- 🌐 **Web interface** - Easy browsing and generation
- 📋 **JSON metadata** - Full parameter export

## API Endpoints

- `GET /` - Web interface
- `GET /generate` - Generate new goose (returns JSON)
- `GET /goose/{uuid}.stl` - Download STL file
- `GET /goose/{uuid}.json` - Download parameters

## Requirements

- Python 3.6+
- No external dependencies (uses Python standard library only)

## Example Usage

```bash
# Start the server
python goose_server.py

# In another terminal, generate a goose via API
curl http://localhost:8080/generate

# Download the STL
curl http://localhost:8080/goose/{uuid}.stl -o my_goose.stl
```

## Output Files

Generated geese are saved in the `generated_geese/` directory:
- `{uuid}.stl` - 3D model file
- `{uuid}.json` - Parameters and metadata

## LENR Open Source Methodology

Following open source principles:
- ✅ Deterministic generation from UUID seeds
- ✅ Full parameter transparency
- ✅ Reproducible builds
- ✅ No proprietary formats
- ✅ Community-driven development

## Goose Parameters

Each goose has randomized (but deterministic) parameters:
- Body length, width, and height
- Neck length and thickness
- Head size
- Beak length
- Wing span
- Leg height
- Tail length

---

**License:** Open Source  
**Generated:** 2024 with Claude
