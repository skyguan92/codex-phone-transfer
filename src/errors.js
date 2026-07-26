export class CptError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "CptError";
  }
}

export class CommandError extends CptError {
  constructor(command, result, options = {}) {
    const detail = result.stderr?.trim() || result.stdout?.trim();
    const suffix = detail ? `\n${detail}` : "";
    super(`${command} exited with code ${result.code}.${suffix}`, options);
    this.name = "CommandError";
    this.code = result.code;
    this.stdout = result.stdout;
    this.stderr = result.stderr;
  }
}
