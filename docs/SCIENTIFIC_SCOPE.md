# Scientific scope and interpretation

## Two implemented methods

### Relative-terrain sensitivity

Priority flood fills local depressions to a spill elevation and builds an acyclic drainage parent. Accumulation in the cropped window identifies a channel proxy at a threshold of 90 cells. For each connected cell, Headwater calculates filled elevation relative to its downstream derived channel. A point asset inherits the value of its cell. Stages `[s(1-u), s, s(1+u)]` are analyst assumptions; counts of assumptions reaching the cell define ordinal bands.

This method is a local drainage screen. It does not implement conservation-law flood propagation, hydrograph routing, roughness calibration, debris entrainment, impact pressure, or a full basin boundary. It must not be described as a full HAND implementation validated against surveyed drainage, a hydraulic solver, or a digital twin.

- Higher: relative height is reached under all three positive stage assumptions.
- Sensitive: reached under one or two assumptions.
- Lower: none of the three reach that relative height. **Not safe.**
- Unknown: no supported grid/drainage connection or location outside the window.

The internal index `100 × reached stages / 3` is a scenario-coverage index. The scenarios have no probability weights, so it is never a probability. The interface prioritizes bands and explanations over an unexplained risk percentage.

### Post-event footprint intersection

Geometric intersection of asset points with the Copernicus interpreted event footprint. Polygon holes are honored. Distance to the mapped boundary supports a user-chosen sensitivity band. This band is not a confidence interval or a forecast expansion. The mapped event is classified as mass movement in the source; it is not a water-depth raster.

## Temporal discipline

A source has observation time, publication time, retrieval time and availability basis. ICIMOD's October 13 interpretation of measurements from before August 26 must not appear as knowledge available before the event. Unknown publication times are gated conservatively at the retrieval timestamp, not guessed from a file modification time.

The satellite catalogue is a present-day query of acquisition records. It does not prove that a processed scene was accessible to an operator at that historical time. A precursor interpretation cannot be inferred from a full-tile thumbnail.

## Sample and spatial limitations

The 438 assessed locations are a damage-selected post-event sample. Raw grades include destroyed, damaged and possibly damaged; the dataset has no complete unaffected comparison population. Do not report regional precision, specificity, total houses at risk or model accuracy from this sample. The source geometry is point-based. Original imagery resolution does not transfer to the much coarser terrain model.

The approximately 34 m grid spacing is sample spacing, not vertical accuracy. The cached source includes historical SRTM/GMTED inputs, so altered channel morphology, structures and small embankments remain unresolved. Missing data must remain unknown.

## Mechanisms

A rock–ice avalanche, stored-water breach and rain-driven flash flood have different initiation processes and model needs. A water-only solver does not automatically model a debris-laden avalanche cascade. The registered hypothesis statuses reflect published interpretations, not posterior likelihoods.

The ICIMOD InSAR report and the indexed Nature pixel-offset statement are method-dependent evidence. They are not identical observations and should not be presented as one source disproving the other. The Nature full text has not been fully verified in this build. Keep expert review pending.

## Next scientific integration

Select an appropriate model (for example r.avaflow for a relevant cascading mass-flow scenario), obtain a release hydrograph or volume ensemble, constrain model parameters, inspect terrain adequacy and benchmark against independently observed extents and arrival observations. Report sensitivity to terrain, volume and rheology. Building loss requires an additional vulnerability model with locally applicable evidence. The current app does not claim those integrations.
