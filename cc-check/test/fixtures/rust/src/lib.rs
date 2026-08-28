mod library;

pub use library::target;

pub fn caller() -> i32 {
    target(1)
}
