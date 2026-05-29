#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    journal_stack_lib::run();
}
