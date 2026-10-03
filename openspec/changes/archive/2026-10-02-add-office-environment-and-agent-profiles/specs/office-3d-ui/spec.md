# Spec Delta

## Purpose

Turns the office from an empty room into a place: a furnished open-plan floor plan,
agents that carry their name and department wherever they appear, and an editor for
each agent's description and instructions.

## ADDED Requirements

### Requirement: Furnished office environment

The 3D office SHALL depict a furnished workspace built only from procedural geometry:
a floor with a defined footprint, at least one desk with a chair and a monitor per
agent, shared furniture per department zone, at least two plants, a rug, and wall
decor including a calendar and a whiteboard. Furniture placement SHALL come from a
pure layout function so it can be verified without WebGL. The scene SHALL NOT fetch
any asset beyond the existing avatar manifest, and the camera SHALL remain above the
floor.

#### Scenario: Office is furnished by default

- **WHEN** the office renders with one or more agents
- **THEN** the scene includes a desk, chair, and monitor per agent plus shared props
  (plants, rug, calendar, whiteboard)

#### Scenario: Department zones are furnished

- **WHEN** agents belong to a department
- **THEN** that zone contains a desk per agent in the department and at least one
  shared prop

#### Scenario: Furniture layout is testable without WebGL

- **WHEN** the layout function is given a set of agents and departments
- **THEN** it returns deterministic positions for desks, chairs, and props that unit
  tests can assert without a rendering context

#### Scenario: No external assets

- **WHEN** the furnished scene renders
- **THEN** no network request is made for furniture models or textures

#### Scenario: Camera stays above the floor

- **WHEN** the user orbits the scene
- **THEN** the camera cannot pass below the floor plane

### Requirement: Agent identity in both views

Every agent SHALL present its name together with its department when it belongs to
one, in the 3D bot label and in the accessible list. An agent with no department
SHALL present its name without a department rather than a misleading placeholder.

#### Scenario: Department under the name in 3D

- **WHEN** a bot belongs to a department
- **THEN** the bot label shows the department directly under the agent's name

#### Scenario: Department under the name in the list

- **WHEN** the accessible list renders an agent that belongs to a department
- **THEN** the department is shown with the agent's name

#### Scenario: Unassigned agent

- **WHEN** an agent belongs to no department
- **THEN** its name is shown with no department

### Requirement: Agent profile editor

The UI SHALL let a user view and edit the selected agent's description and
instructions and save them. Saving SHALL report success and persist the values;
a rejected save SHALL surface the error and keep the editor's content so no work is
lost. The editor SHALL show the agent's saved values when the agent is selected.

#### Scenario: Edit and save

- **WHEN** the user edits the description and instructions and saves
- **THEN** a success confirmation is shown and reopening the agent shows the saved
  values

#### Scenario: Save fails

- **WHEN** a save is rejected by the runtime
- **THEN** the error is shown and the edited text remains in the editor

#### Scenario: Switching agents loads their profile

- **WHEN** the user selects a different agent
- **THEN** the editor shows that agent's saved description and instructions
