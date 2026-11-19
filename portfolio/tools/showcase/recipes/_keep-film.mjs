/**
 * KEEP is filmed from a private copy of its Godot project, changed only as far
 * as filming needs: a 3:2 window so the corner HUD survives, a tighter camera so
 * the Keeper reads at card size, no save file (the film must neither read nor
 * touch a player's progress), and a small bot that plays each room by pressing
 * the game's real input actions. The physics, levels and art are untouched.
 */
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const USER_DIR = 'keep-film-rig';

const BOT = `extends Node
## Film rig (exists only in this copy of the project): plays a room by pressing the real input
## actions from a list of steps. Run with  -- --level=<n> --film=<route> [--trace]

const T := 16.0
var steps: Array = []
var idx := 0
var wait := 0
var waiting := false
var frame := 0
var deaths := 0
var completed := false
var held := {}
var trace := 0
var done_at := -1

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	process_physics_priority = -100
	trace = int(Game.args.get("trace", "0"))
	steps = _route(String(Game.args.get("film", "")))

func _physics_process(_d: float) -> void:
	var p: Node = Game.player
	if p == null or not is_instance_valid(p) or not Game._demo_running:
		return
	frame += 1
	if not Game.timer_running and not completed:
		completed = true
		print("COMPLETE f=%d m=%d run_time=%.4f deaths=%d" % [frame, Engine.get_process_frames(), Game.run_time, Game.deaths])
	if trace > 0 and frame % trace == 0:
		print("f=%d m=%d x=%.0f y=%.0f vx=%.0f vy=%.0f st=%d floor=%s col=%.0f step=%d aim=%s up=%s iv=%s" % [frame, Engine.get_process_frames(), p.position.x, p.position.y, p.velocity.x, p.velocity.y, p.st, p.is_on_floor(), p.collected, idx, p.aim, Input.is_action_pressed("move_up"), Input.get_vector("move_left", "move_right", "move_up", "move_down")])
	if p.st == p.St.DEAD and deaths == 0:
		deaths = 1
		print("DIED f=%d m=%d x=%.0f y=%.0f step=%d" % [frame, Engine.get_process_frames(), p.position.x, p.position.y, idx])
	for a in held:
		if not Input.is_action_pressed(a):
			Input.action_press(a)
	var guard := 0
	while idx < steps.size() and guard < 64:
		guard += 1
		if not _do(steps[idx], p):
			return
		idx += 1
	if idx >= steps.size() and done_at < 0:
		done_at = frame
		print("ROUTE DONE f=%d m=%d x=%.0f y=%.0f" % [frame, Engine.get_process_frames(), p.position.x, p.position.y])

func _send(action: String, pressed: bool) -> void:
	if pressed:
		held[action] = true
		Input.action_press(action)
	else:
		held.erase(action)
		Input.action_release(action)

## Runs one step. True when it is finished and the next may run in the same frame.
func _do(s: Array, p: Node) -> bool:
	var k: String = s[0]
	if k == "hold":
		_send(s[1], true)
		return true
	if k == "free":
		_send(s[1], false)
		return true
	if k == "mark":
		print("MARK %s f=%d m=%d x=%.0f y=%.0f vy=%.0f" % [s[1], frame, Engine.get_process_frames(), p.position.x, p.position.y, p.velocity.y])
		return true
	if k == "wait":
		if not waiting:
			waiting = true
			wait = int(s[1])
			return false
		wait -= 1
		if wait <= 0:
			waiting = false
			return true
		return false
	if k == "x>": return p.position.x >= s[1]
	if k == "x<": return p.position.x <= s[1]
	if k == "y>": return p.position.y >= s[1]
	if k == "y<": return p.position.y <= s[1]
	if k == "vy>": return p.velocity.y >= s[1]
	if k == "vy<": return p.velocity.y <= s[1]
	if k == "floor": return p.is_on_floor()
	if k == "air": return not p.is_on_floor()
	if k == "normal": return p.st == p.St.NORMAL
	push_error("unknown step " + k)
	return true

## Press for n frames, then let go.
func _tap(action: String, n: int) -> Array:
	return [["hold", action], ["wait", n], ["free", action]]

func _jump(n: int = 14) -> Array:
	return _tap("jump", n)

## Open the Pocket, aim with the given directions while it drinks, hold for n frames, let go.
func _pour(aim: Array, n: int) -> Array:
	var out: Array = [["hold", "pocket"]]
	for a in aim:
		out.append(["hold", a])
	out.append(["wait", n])
	out.append(["free", "pocket"])
	out.append(["wait", 3])
	for a in aim:
		out.append(["free", a])
	return out

func _route(route: String) -> Array:
	match route:
		"threshold": return _threshold()
		"reliquary": return _reliquary()
		"well": return _well()
		"gallery": return _gallery()
		"choir": return _choir()
		"keep": return _keep()
	return []

func _chain(parts: Array) -> Array:
	var out: Array = []
	for part in parts:
		out.append_array(part)
	return out

# Room 1: run the hall, clearing the pits, up over the block and on, with a dash across the deep pit.
func _threshold() -> Array:
	return _chain([
		[["mark", "start"], ["hold", "move_right"], ["x>", 66]], _jump(16),
		[["floor"], ["x>", 212]], _jump(14),
		[["floor"], ["x>", 338]], _jump(8),
		[["wait", 4], ["floor"], ["mark", "on-block"], ["x>", 394]], _jump(14),
		[["wait", 8]], _pour([], 3),
		[["normal"], ["floor"], ["mark", "pit3"], ["x>", 532]], _jump(16),
		[["floor"], ["mark", "landed-far"], ["wait", 40], ["mark", "end"]],
	])

# Room 3: off the ledge, drink the fall just above the spikes, pour straight up, steer onto the block.
func _reliquary() -> Array:
	return _chain([
		[["mark", "start"], ["hold", "move_right"], ["x>", 138], ["free", "move_right"], ["mark", "falling"], ["y>", 196], ["mark", "drink"]],
		_pour(["move_up", "move_right"], 16),
		[["mark", "poured"], ["hold", "move_right"], ["wait", 10], ["floor"], ["mark", "block"]],
		[["x>", 426], ["mark", "second-drop"], ["free", "move_right"], ["y>", 268], ["mark", "drink2"]],
		_pour(["move_up", "move_right"], 14),
		[["mark", "poured2"], ["hold", "move_right"], ["wait", 6], ["floor"], ["mark", "exit-floor"], ["wait", 60], ["mark", "end"]],
	])

# Room 4: step off into the well, ride to the rest ledge, then the long drop and a rocket into the alcove.
func _well() -> Array:
	return _chain([
		[["mark", "start"], ["hold", "move_right"], ["x>", 150], ["free", "move_right"], ["mark", "over"], ["floor"], ["mark", "ledge"]],
		[["wait", 18], ["hold", "move_right"], ["x>", 214], ["free", "move_right"], ["mark", "stepped"], ["y>", 492], ["mark", "drink"]],
		_pour(["move_up", "move_right"], 16),
		[["mark", "poured"], ["hold", "move_right"], ["wait", 8], ["floor"], ["mark", "alcove"], ["wait", 60], ["mark", "end"]],
	])

# Room 6: the crossing: dive off the cliff, drink low, pour up and steer across the chasm, run the bridge.
func _gallery() -> Array:
	return _chain([
		[["mark", "start"], ["hold", "move_right"], ["x>", 166], ["free", "move_right"], ["mark", "falling"], ["y>", 262], ["mark", "drink"]],
		_pour(["move_up", "move_right"], 16),
		[["mark", "poured"], ["hold", "move_right"], ["wait", 10], ["floor"], ["mark", "landed"], ["x>", 700], ["mark", "bridge-crossed"], ["wait", 40], ["mark", "end"]],
	])

# Room 5: over the thorn bed with a dash, along the room, over the spike run, under the thorn ceiling.
func _choir() -> Array:
	return _chain([
		[["mark", "start"], ["hold", "move_right"], ["x>", 84]], _jump(16),
		[["wait", 10]], _pour([], 3),
		[["normal"], ["floor"], ["mark", "over-bed"], ["x>", 322]], _jump(16),
		[["wait", 10]], _pour([], 3),
		[["normal"], ["floor"], ["mark", "over-spikes"], ["x>", 534]], _jump(5),
		[["wait", 4], ["floor"], ["mark", "over-gap"], ["wait", 50], ["mark", "end"]],
	])

# Room 8: jump into the pit, drink low, pour across, clear the hover gap, then dive the last shaft and rocket out.
func _keep() -> Array:
	return _chain([
		[["mark", "start"], ["hold", "move_right"], ["x>", 78]], _jump(16),
		[["y>", 206], ["mark", "drink"]],
		_pour(["move_up", "move_right"], 12),
		[["mark", "poured"], ["hold", "move_right"], ["wait", 8], ["floor"], ["mark", "over-pit"], ["x>", 350]], _jump(16),
		[["wait", 8]], _pour([], 3),
		[["normal"], ["floor"], ["mark", "over-gap"], ["x>", 694], ["free", "move_right"], ["mark", "shaft"], ["y>", 300], ["mark", "drink2"]],
		_pour(["move_up", "move_right"], 14),
		[["mark", "poured2"], ["hold", "move_right"], ["wait", 8], ["floor"], ["mark", "landed"], ["wait", 80], ["mark", "end"]],
	])
`;

function patch(file, edits) {
  let text = readFileSync(file, 'utf8');
  for (const [pattern, replacement] of edits) {
    const next = text.replace(pattern, replacement);
    if (next === text) throw new Error(path.basename(file) + ': nothing matched ' + pattern);
    text = next;
  }
  writeFileSync(file, text);
}

/** A fresh film copy of the game's web-export source. Returns its folder. */
export function prepareFilmCopy(work) {
  const source = path.join(work, 'build-src', 'keep');
  const film = path.join(work, 'build-src', 'keep-film');
  if (!existsSync(source)) throw new Error('missing ' + source);
  rmSync(film, { recursive: true, force: true });
  cpSync(source, film, { recursive: true });
  const script = (name) => path.join(film, 'scripts', name);

  patch(path.join(film, 'project.godot'), [
    [/window\/size\/viewport_width=480/, 'window/size/viewport_width=405'],
    [/window\/size\/window_width_override=1440/, 'window/size/window_width_override=1620'],
    [/window\/size\/window_height_override=810/, 'window/size/window_height_override=1080'],
    [/config\/name="KEEP"/, 'config/name="KEEP"\nconfig/use_custom_user_dir=true\nconfig/custom_user_dir_name="' + USER_DIR + '"'],
    [/\s*$/, '\n\n[editor]\n\nmovie_writer/mjpeg_quality=0.98\n'],
  ]);
  patch(script('hud.gd'), [
    [/var x := 480 - 6/, 'var x := 405 - 6'],
    [/name_txt\.position = Vector2\(240, 250\)/, 'name_txt.position = Vector2(202, 250)'],
    [/hint_txt\.position = Vector2\(240, 262\)/, 'hint_txt.position = Vector2(202, 262)'],
  ]);
  patch(script('level.gd'), [
    [/camera\.limit_right = maxi\(pixel_w, 480\)/, 'camera.limit_right = maxi(pixel_w, 405)'],
    [/camera\.position_smoothing_enabled = true/, 'camera.zoom = Vector2.ONE * float(Game.args.get("zoom", "1.0"))\n\tcamera.position_smoothing_enabled = true'],
  ]);
  patch(script('main.gd'), [[/vignette\.position = Vector2\.ZERO/, 'vignette.position = Vector2(-37, 0)']]);
  patch(script('game.gd'), [
    [/(_demo = _demo_script\(String\(args\["demo"\]\)\)\r?\n)/, '$1\tif args.has("film"):\n\t\tadd_child.call_deferred(load("res://scripts/film_bot.gd").new())\n'],
    [/func save\(\) -> void:\r?\n/, 'func save() -> void:\n\treturn\n'],
    [/func load_save\(\) -> void:\r?\n/, 'func load_save() -> void:\n\treturn\n'],
  ]);
  writeFileSync(script('film_bot.gd'), BOT);
  return film;
}
