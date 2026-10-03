# Spec Delta

## REMOVED Requirements

**Reason for the whole capability:** the free-orbit 3D office is replaced by the
isometric 2D office in `office-2d-ui`. The requirements below described a rotatable 3D
perspective scene (`maxPolarAngle`, a 3D camera, 3D link endpoints); that behaviour no
longer exists. Requirements that remain useful — state visuals, communication markers,
the inspector, the list fallback, identity, and the profile editor — are restated in
`office-2d-ui`, so they are removed here only because their capability is retired.

### Requirement: Office scene

**Reason:** replaced by `office-2d-ui` "Office scene", which describes the flat floor
instead of a 3D scene.

### Requirement: Replaceable bot model

**Reason:** replaced by `office-2d-ui` "Replaceable bot model" (existing models, same
manifest).

### Requirement: State-driven bot visuals

**Reason:** replaced by `office-2d-ui` "State-driven bot visuals", which adds the explicit
working and done indication.

### Requirement: Bot selection and inspector

**Reason:** replaced by `office-2d-ui` "Bot selection and inspector" (unchanged
behaviour).

### Requirement: Context pressure mood

**Reason:** replaced by `office-2d-ui` "Context pressure mood" (unchanged behaviour).

### Requirement: Dependency and report visibility

**Reason:** replaced by `office-2d-ui` "Dependency and report visibility" (unchanged
behaviour).

### Requirement: Live office updates

**Reason:** replaced by `office-2d-ui` "Live office updates", which now also covers floor
positions.

### Requirement: Accessible list fallback

**Reason:** replaced by `office-2d-ui` "Accessible list fallback" (unchanged behaviour).

### Requirement: Minimal and composable UI boundary

**Reason:** replaced by `office-2d-ui` "Minimal and composable UI boundary" (unchanged
behaviour).

### Requirement: Communication marker

**Reason:** replaced by `office-2d-ui` "Communication marker", which draws the link on the
floor instead of between 3D bots.

### Requirement: Communication summary on hover or focus

**Reason:** replaced by `office-2d-ui` "Communication summary on hover or focus"
(unchanged behaviour).

### Requirement: Furnished office environment

**Reason:** replaced by `office-2d-ui` "Furnished office environment", which drops the 3D
camera clamp and reuses the existing procedural models.

### Requirement: Agent identity in both views

**Reason:** replaced by `office-2d-ui` "Agent identity in both views" (unchanged
behaviour).

### Requirement: Agent profile editor

**Reason:** replaced by `office-2d-ui` "Agent profile editor" (unchanged behaviour).
